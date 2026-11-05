/**
 * Batch orchestration service managing uploads, start dispatching, retries, and whitelist lifecycle.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config";
import {
  addJobToBatchWithLock,
  countJobsByBatchId,
  createDraftBatch as createDraftBatchRepository,
  deleteJob,
  deleteBatchRow,
  deleteBatchRowOwnedByUser,
  getAccountUsage,
  getActiveRetryJob,
  getBatch,
  getBatchOwnedByUser,
  getExpiredBatches,
  getJob,
  getJobOwnedByUser,
  getJobsByBatchId,
  getPendingJobsByBatchId,
  insertBatchAndJobs,
  insertRetryJob,
  listBatchesByUserId,
  markBatchWhitelistDeleted,
  setBatchStarted,
  updateBatchName,
  updateJobQueued,
  updateJobState,
} from "../repositories/job.repository";
import { getFaceListOwnedByUser } from "../repositories/face-list.repository";
import { publishJob } from "../messaging";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../storage";
import { BatchConfig } from "../types";
import { JobStatus } from "../generated/prisma/client";
import {
  buildImageRedactCommand,
  calculateNextJobState,
  deriveBatchStatus,
  JobState,
  resolveOutputExtension,
} from "../domain";
import {
  batchNameSchema,
  BatchListResponseDTO,
  BatchResponseDTO,
  BatchSummaryItemDTO,
  JobResponseDTO,
  parseBatchConfig,
  parseBatchConfigJson,
  parseBatchName,
  ReportResponseDTO,
  toBatchResponse,
  toJobResponse,
  toReportResponse,
  UUID_REGEX,
  validateBatchCreation,
  validateSingleUploadFile,
  validateUploadFiles,
  ValidatedJobEvent,
} from "../dto";
import { badRequest, conflict, gone, notFound, unavailable } from "../errors";

/**
 * Creates a new draft batch with optional whitelist faces or saved face list references.
 *
 * Why biometric server-side copy: When a batch references a saved face list, the list's objects are
 * copied directly into the batch's isolated `uploads/<batchId>/whitelist/` path. This decouples the
 * batch lifecycle from the saved list. When all jobs in the batch finish processing, the batch's
 * whitelist copies are purged immediately without deleting the user's permanent list. Conversely,
 * if the user deletes their saved face list, running batches continue processing safely without broken references.
 */
export async function createDraftBatch(options: {
  whitelist?: Express.Multer.File[];
  faceListId?: string;
  rawConfig?: unknown;
  filesPresent?: boolean;
  name?: unknown;
  userId?: string;
}): Promise<BatchResponseDTO> {
  const { whitelist = [], faceListId, rawConfig, filesPresent = false, name } = options;

  validateBatchCreation({ filesPresent, whitelist, faceListId });

  const batchConfig: BatchConfig = parseBatchConfigJson(rawConfig);
  const validatedName = parseBatchName(name);
  const batchId = randomUUID();

  const whitelistKeys: string[] = [];
  try {
    if (faceListId) {
      if (!UUID_REGEX.test(faceListId) || !options.userId) {
        throw notFound("Face list not found");
      }
      const faceList = await getFaceListOwnedByUser(faceListId, options.userId);
      if (!faceList) {
        throw notFound("Face list not found");
      }

      for (let i = 0; i < faceList.keys.length; i++) {
        const sourceKey = faceList.keys[i]!;
        const ext = path.extname(sourceKey).toLowerCase() || ".jpg";
        const destKey = `${batchId}/whitelist/face-${i + 1}${ext}`;
        await storage.copyObject(UPLOADS_BUCKET, sourceKey, destKey);
        whitelistKeys.push(destKey);
      }
    } else {
      for (let i = 0; i < whitelist.length; i++) {
        const file = whitelist[i]!;
        const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
        const key = `${batchId}/whitelist/face-${i + 1}${ext}`;
        await storage.putObject(UPLOADS_BUCKET, key, file.buffer, file.mimetype);
        whitelistKeys.push(key);
      }
    }

    const createdBatch = await createDraftBatchRepository({
      id: batchId,
      userId: options.userId,
      name: validatedName,
      config: batchConfig,
      whitelistKeys,
    });

    return toBatchResponse(createdBatch, []);
  } catch (error) {
    if (whitelistKeys.length > 0) {
      try {
        await storage.deletePrefix(UPLOADS_BUCKET, `${batchId}/whitelist/`);
      } catch (cleanErr) {
        console.error("Failed to cleanup whitelist on draft batch creation error", cleanErr);
      }
    }
    throw error;
  }
}

export const createBatch = createDraftBatch;

export async function addBatchFile(
  batchId: string,
  file?: Express.Multer.File,
  userId?: string,
): Promise<JobResponseDTO> {
  const validFile = validateSingleUploadFile(file);

  const batch = userId ? await getBatchOwnedByUser(batchId, userId) : await getBatch(batchId);
  if (!batch) {
    throw notFound("Batch not found");
  }
  if (batch.startedAt !== null) {
    throw conflict("Batch has already been started", "BATCH_STARTED");
  }

  const batchConfig = parseBatchConfig(batch.config);
  const jobId = randomUUID();
  const ext = path.extname(validFile.originalname).toLowerCase() || ".jpg";
  const inputKey = `${batchId}/${jobId}/input${ext}`;
  const outExt = resolveOutputExtension(batchConfig.format, validFile.originalname);
  const outputKey = `${batchId}/${jobId}/result.${outExt}`;

  await storage.putObject(UPLOADS_BUCKET, inputKey, validFile.buffer, validFile.mimetype);

  try {
    const job = await addJobToBatchWithLock(batchId, {
      id: jobId,
      originalFilename: validFile.originalname,
      inputKey,
      outputKey,
      inputBytes: validFile.size,
    });
    return toJobResponse(job);
  } catch (error) {
    try {
      await storage.deleteObject(UPLOADS_BUCKET, inputKey);
    } catch (delErr) {
      console.error(`Failed to delete uploaded object ${inputKey} on error`, delErr);
    }
    throw error;
  }
}

/**
 * Starts a draft batch by publishing all pending image jobs to the NATS worker queue.
 *
 * Why start idempotency: Calling startBatch repeatedly is safe and idempotent. If a caller clicks
 * "Start without them" or retries a failed start call, only jobs remaining in PENDING status are
 * enqueued. startedAt is marked once, avoiding duplicate command dispatches to workers.
 */
export async function startBatch(batchId: string, userId?: string): Promise<BatchResponseDTO> {
  const batch = userId ? await getBatchOwnedByUser(batchId, userId) : await getBatch(batchId);
  if (!batch) {
    throw notFound("Batch not found");
  }

  const jobs = await getJobsByBatchId(batchId);
  if (jobs.length === 0) {
    throw badRequest("Batch has no jobs", "BATCH_EMPTY");
  }

  // Idempotently record the start timestamp if this is the first start execution
  if (batch.startedAt === null) {
    await setBatchStarted(batchId);
  }

  // Fetch only unstarted jobs to prevent publishing duplicate processing commands
  const pendingJobs = await getPendingJobsByBatchId(batchId);
  const batchConfig = parseBatchConfig(batch.config);

  for (const job of pendingJobs) {
    const command = buildImageRedactCommand({
      jobId: job.id,
      batchId: batch.id,
      inputKey: job.inputKey,
      outputKey: job.outputKey,
      config: batchConfig,
      whitelistKeys: batch.whitelistKeys,
    });

    try {
      await publishJob("jobs.image", command);
      await updateJobQueued(job.id);
    } catch (error) {
      console.error(`Failed to publish command for job ${job.id}`, error);
      throw unavailable("Job queue is unavailable");
    }
  }

  const updatedBatch = await getBatch(batchId);
  const updatedJobs = await getJobsByBatchId(batchId);
  return toBatchResponse(updatedBatch!, updatedJobs);
}

export async function getBatchById(id: string, userId?: string): Promise<BatchResponseDTO | null> {
  const batch = userId ? await getBatchOwnedByUser(id, userId) : await getBatch(id);
  if (!batch) return null;
  const jobs = await getJobsByBatchId(id);
  return toBatchResponse(batch, jobs);
}

export async function renameBatch(id: string, rawName: string, userId?: string): Promise<BatchResponseDTO> {
  const batch = userId ? await getBatchOwnedByUser(id, userId) : await getBatch(id);
  if (!batch) {
    throw notFound("Batch not found");
  }
  const name = batchNameSchema.parse(rawName);
  const updated = await updateBatchName(id, name);
  const jobs = await getJobsByBatchId(id);
  return toBatchResponse(updated, jobs);
}

export async function getBatchReportById(id: string, userId?: string): Promise<ReportResponseDTO | null> {
  const batch = userId ? await getBatchOwnedByUser(id, userId) : await getBatch(id);
  if (!batch) return null;
  const jobs = await getJobsByBatchId(id);
  return toReportResponse(batch, jobs);
}

export async function deleteBatchById(id: string, userId?: string): Promise<boolean> {
  const batch = userId ? await getBatchOwnedByUser(id, userId) : await getBatch(id);
  if (!batch) return false;

  await storage.deletePrefix(UPLOADS_BUCKET, `${id}/`);
  await storage.deletePrefix(RESULTS_BUCKET, `${id}/`);
  return userId ? deleteBatchRowOwnedByUser(id, userId) : deleteBatchRow(id);
}

/**
 * Creates and starts a new batch using original image inputs from a previous batch with fresh settings.
 *
 * Why server-side copy: Duplicating original inputs into the new batch's S3 namespace keeps contract §5
 * path isolation intact so deleting either batch never affects the other, avoiding client re-upload overhead.
 */
export async function rerunBatch(
  sourceId: string,
  options: {
    whitelist?: Express.Multer.File[];
    faceListId?: string;
    rawConfig?: unknown;
    name?: unknown;
    userId?: string;
  },
): Promise<{ batch: BatchResponseDTO; skipped: number }> {
  const sourceBatch = options.userId ? await getBatchOwnedByUser(sourceId, options.userId) : await getBatch(sourceId);

  if (!sourceBatch) {
    throw notFound("Batch not found");
  }

  if (sourceBatch.startedAt === null) {
    throw conflict("Source batch has not been started", "BATCH_NOT_STARTED");
  }

  const defaultName = `${sourceBatch.name} (re-run)`.slice(0, 100);
  const targetName =
    typeof options.name === "string" && options.name.trim().length > 0 ? options.name.trim() : defaultName;

  const draftBatch = await createDraftBatch({
    whitelist: options.whitelist,
    faceListId: options.faceListId,
    rawConfig: options.rawConfig,
    filesPresent: false,
    name: targetName,
    userId: options.userId,
  });

  try {
    const sourceJobs = await getJobsByBatchId(sourceId);
    const seenInputKeys = new Set<string>();
    const distinctJobs: typeof sourceJobs = [];
    for (const job of sourceJobs) {
      if (!seenInputKeys.has(job.inputKey)) {
        seenInputKeys.add(job.inputKey);
        distinctJobs.push(job);
      }
    }

    let skipped = 0;
    let copiedCount = 0;
    const newBatchConfig = parseBatchConfig(draftBatch.config);

    for (const sourceJob of distinctJobs) {
      const exists = await storage.objectExists(UPLOADS_BUCKET, sourceJob.inputKey);
      if (!exists) {
        skipped++;
        continue;
      }

      const newJobId = randomUUID();
      const ext =
        path.extname(sourceJob.originalFilename).toLowerCase() ||
        path.extname(sourceJob.inputKey).toLowerCase() ||
        ".jpg";
      const destInputKey = `${draftBatch.id}/${newJobId}/input${ext}`;
      const outExt = resolveOutputExtension(newBatchConfig.format, sourceJob.originalFilename);
      const destOutputKey = `${draftBatch.id}/${newJobId}/result.${outExt}`;

      try {
        await storage.copyObject(UPLOADS_BUCKET, sourceJob.inputKey, destInputKey);
      } catch (err: unknown) {
        const s3Err = err as { $metadata?: { httpStatusCode?: number }; name?: string };
        if (s3Err?.$metadata?.httpStatusCode === 404 || s3Err?.name === "NoSuchKey" || s3Err?.name === "NotFound") {
          skipped++;
          continue;
        }
        throw err;
      }

      await addJobToBatchWithLock(draftBatch.id, {
        id: newJobId,
        originalFilename: sourceJob.originalFilename,
        inputKey: destInputKey,
        outputKey: destOutputKey,
        inputBytes: sourceJob.inputBytes ?? undefined,
      });
      copiedCount++;
    }

    if (copiedCount === 0) {
      throw gone("No original images remain in storage for this batch", "NO_ORIGINALS");
    }

    const startedBatch = await startBatch(draftBatch.id, options.userId);

    return {
      batch: startedBatch,
      skipped,
    };
  } catch (error) {
    try {
      await deleteBatchById(draftBatch.id, options.userId);
    } catch (cleanupError) {
      console.error(`Failed to clean up draft batch ${draftBatch.id} after rerun failure`, cleanupError);
    }
    throw error;
  }
}

export async function listBatches(
  userId: string,
  options: { limit: number; cursor?: string },
): Promise<BatchListResponseDTO> {
  const batches = await listBatchesByUserId(userId, options);
  const hasMore = batches.length > options.limit;
  const pageBatches = hasMore ? batches.slice(0, options.limit) : batches;
  const nextCursor = hasMore ? pageBatches[pageBatches.length - 1].id : null;

  const items: BatchSummaryItemDTO[] = pageBatches.map((batch) => {
    const jobs = batch.jobs;
    const total = jobs.length;
    const completed = jobs.filter((j) => j.status === JobStatus.COMPLETED).length;
    const failed = jobs.filter((j) => j.status === JobStatus.FAILED).length;
    const status = deriveBatchStatus(
      jobs.map((j) => j.status),
      batch.startedAt,
    );
    const firstCompleted = jobs.find((j) => j.status === JobStatus.COMPLETED && j.resultUrl);
    const thumbnailUrl = firstCompleted ? firstCompleted.resultUrl : null;
    const bytes = jobs.reduce((sum, j) => sum + (j.inputBytes ?? 0) + (j.resultBytes ?? 0), 0);

    return {
      id: batch.id,
      name: batch.name,
      createdAt: batch.createdAt.toISOString(),
      status,
      jobCounts: { total, completed, failed },
      thumbnailUrl,
      bytes,
    };
  });

  const usage = await getAccountUsage(userId);

  return {
    batches: items,
    nextCursor,
    usage,
  };
}

export async function deleteJobById(id: string, userId: string): Promise<void> {
  const job = await getJobOwnedByUser(id, userId);
  if (!job) {
    throw notFound("Job not found");
  }

  if (job.status === JobStatus.QUEUED || job.status === JobStatus.PROCESSING) {
    throw conflict("Cannot delete an active job", "JOB_ACTIVE");
  }

  try {
    await storage.deleteObject(UPLOADS_BUCKET, job.inputKey);
  } catch (err) {
    console.error(`Failed to delete input object ${job.inputKey}`, err);
  }

  try {
    await storage.deleteObject(RESULTS_BUCKET, job.outputKey);
  } catch (err) {
    console.error(`Failed to delete result object ${job.outputKey}`, err);
  }

  const totalJobs = await countJobsByBatchId(job.batchId);
  if (totalJobs <= 1) {
    await deleteBatchById(job.batchId, userId);
  } else {
    await deleteJob(job.id);
    await checkAndCleanBatchWhitelist(job.batchId);
  }
}

export async function getJobById(id: string, userId?: string): Promise<JobResponseDTO | null> {
  const job = userId ? await getJobOwnedByUser(id, userId) : await getJob(id);
  return toJobResponse(job);
}

export async function retryFailedJob(id: string, userId?: string): Promise<JobResponseDTO> {
  const failedJob = userId ? await getJobOwnedByUser(id, userId) : await getJob(id);
  if (!failedJob) {
    throw gone("Job not found or its batch has expired", "JOB_EXPIRED");
  }
  if (failedJob.status !== JobStatus.FAILED) {
    throw badRequest("Only FAILED jobs can be retried", "JOB_NOT_FAILED");
  }

  const batch = await getBatch(failedJob.batchId);
  if (!batch) {
    throw gone("Batch has expired", "BATCH_EXPIRED");
  }
  if (batch.whitelistKeys.length > 0 && batch.whitelistDeletedAt !== null) {
    throw gone("Whitelist files have expired and cannot be used for retry", "WHITELIST_EXPIRED");
  }
  if (!(await storage.objectExists(UPLOADS_BUCKET, failedJob.inputKey))) {
    throw gone("Original input has expired and cannot be retried", "INPUT_EXPIRED");
  }
  for (const whitelistKey of batch.whitelistKeys) {
    if (!(await storage.objectExists(UPLOADS_BUCKET, whitelistKey))) {
      throw gone("Whitelist files have expired and cannot be used for retry", "WHITELIST_EXPIRED");
    }
  }

  const activeRetry = await getActiveRetryJob(failedJob);
  if (activeRetry) {
    return toJobResponse(activeRetry)!;
  }

  const batchConfig = parseBatchConfigJson(batch.config);
  const retryJobId = randomUUID();
  const retryJob = {
    id: retryJobId,
    batchId: failedJob.batchId,
    originalFilename: failedJob.originalFilename,
    inputKey: failedJob.inputKey,
    outputKey: `${failedJob.batchId}/${retryJobId}/result.${resolveOutputExtension(
      batchConfig.format,
      failedJob.originalFilename,
    )}`,
    inputBytes: failedJob.inputBytes,
  };
  await insertRetryJob(retryJob);

  try {
    const command = buildImageRedactCommand({
      jobId: retryJob.id,
      batchId: retryJob.batchId,
      inputKey: retryJob.inputKey,
      outputKey: retryJob.outputKey,
      config: batchConfig,
      whitelistKeys: batch.whitelistKeys,
    });
    await publishJob("jobs.image", command);
    await updateJobQueued(retryJob.id);
  } catch (error) {
    await deleteJob(retryJob.id);
    console.error(`Failed to publish retry command for job ${id}`, error);
    throw unavailable("Job queue is unavailable");
  }

  const createdRetry = await getJob(retryJob.id);
  if (!createdRetry) {
    throw unavailable("Retry job could not be created");
  }
  return toJobResponse(createdRetry)!;
}

export async function getJobOriginalStream(id: string, userId?: string) {
  const job = userId ? await getJobOwnedByUser(id, userId) : await getJob(id);
  if (!job) return null;
  const streamInfo = await storage.getObjectStream(UPLOADS_BUCKET, job.inputKey);
  if (!streamInfo) return null;
  return {
    ...streamInfo,
    filename: job.originalFilename,
  };
}

export async function applyJobEvent(event: ValidatedJobEvent): Promise<void> {
  const current = await getJob(event.jobId);
  if (!current) return;

  const currentState: JobState = {
    status: current.status,
    progress: current.progress,
    stage: current.stage,
    resultUrl: current.resultUrl,
    resultSummary: current.resultSummary as Record<string, unknown> | null,
    error: current.error as { code: string; message: string } | null,
  };

  const nextState = calculateNextJobState(currentState, event, config.PUBLIC_RESULTS_BASE_URL);

  let resultBytes: number | null | undefined = undefined;
  if (nextState.status === JobStatus.COMPLETED) {
    resultBytes = await storage.statObject(RESULTS_BUCKET, current.outputKey);
  }

  await updateJobState(event.jobId, {
    status: nextState.status,
    progress: nextState.progress,
    stage: nextState.stage,
    resultUrl: nextState.resultUrl,
    resultSummary: nextState.resultSummary,
    error: nextState.error,
    resultBytes,
  });
}

/**
 * Evaluates terminal status across all jobs in a batch to trigger biometric reference cleanup.
 *
 * Why whitelist cleanup timing: To uphold privacy commitments and prevent lingering biometric data,
 * reference whitelist faces stored in the uploads bucket are purged from S3 immediately after all
 * jobs reach terminal state (COMPLETED or FAILED). Marking whitelistDeletedAt ensures single execution.
 */
export async function checkAndCleanBatchWhitelist(batchId: string): Promise<void> {
  const batch = await getBatch(batchId);
  if (!batch || batch.startedAt === null || batch.whitelistDeletedAt !== null) {
    return;
  }

  const jobs = await getJobsByBatchId(batchId);
  if (jobs.length === 0) {
    return;
  }

  // Whitelist files remain in S3 while any image job is still processing or queued
  const remainingNonTerminal = jobs.some(
    (job) => job.status !== JobStatus.COMPLETED && job.status !== JobStatus.FAILED,
  );
  if (remainingNonTerminal) {
    return;
  }

  try {
    await storage.deletePrefix(UPLOADS_BUCKET, `${batchId}/whitelist/`);
  } catch (error) {
    console.error(`Failed to delete S3 whitelist objects for batch ${batchId}`, error);
  }

  try {
    await markBatchWhitelistDeleted(batchId);
  } catch (error) {
    console.error(`Failed to update whitelistDeletedAt for batch ${batchId}`, error);
  }
}

export async function cleanupExpiredBatches(): Promise<number> {
  const expiredBatches = await getExpiredBatches();
  let deleted = 0;

  for (const batch of expiredBatches) {
    for (const bucket of [UPLOADS_BUCKET, RESULTS_BUCKET]) {
      try {
        await storage.deletePrefix(bucket, `${batch.id}/`);
      } catch (error) {
        console.error(`Failed to clean expired objects for batch ${batch.id} in ${bucket}`, error);
      }
    }

    try {
      if (await deleteBatchRow(batch.id)) {
        deleted++;
      }
    } catch (error) {
      console.error(`Failed to delete expired batch row ${batch.id}`, error);
    }
  }

  return deleted;
}
