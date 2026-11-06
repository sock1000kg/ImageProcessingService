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
import { parseFaceNamesMap, sanitizeFaceFileName } from "./face-list.service";
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
  MAX_WHITELIST_FILES,
  parseBatchConfig,
  parseBatchConfigJson,
  parseBatchName,
  parseFaceListIds,
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
 * Creates a new draft batch record, referencing saved allow lists directly and storing uploaded whitelist files.
 *
 * Why direct reference for allow lists: A batch references the allow list's own photos under `uploads/lists/...`
 * directly instead of copying them. Deleting an allow list removes the photos, and retrying failed jobs continues
 * working while the list exists. Directly uploaded reference photos (not saved to a list) remain scoped to
 * `<batchId>/whitelist/` and are deleted upon batch completion.
 */
export async function createDraftBatch(options: {
  whitelist?: Express.Multer.File[];
  faceListIds?: string[];
  faceListId?: string;
  rawConfig?: unknown;
  filesPresent?: boolean;
  name?: unknown;
  userId?: string;
}): Promise<BatchResponseDTO> {
  const { whitelist = [], rawConfig, filesPresent = false, name } = options;
  const faceListIds = parseFaceListIds(options);

  validateBatchCreation({ filesPresent, whitelist, faceListIds });

  const batchConfig: BatchConfig = parseBatchConfigJson(rawConfig);
  const validatedName = parseBatchName(name);

  // Validate all face lists first (UUID and ownership) BEFORE any storage or DB writes
  const faceLists: Array<{ id: string; name: string; keys: string[]; faceNames?: unknown }> = [];
  if (faceListIds && faceListIds.length > 0) {
    for (const id of faceListIds) {
      if (!UUID_REGEX.test(id) || !options.userId) {
        throw notFound("Face list not found");
      }
      const faceList = await getFaceListOwnedByUser(id, options.userId);
      if (!faceList) {
        throw notFound("Face list not found");
      }
      faceLists.push(faceList);
    }
  }

  // Check total face count across all face lists and uploaded files
  const listFacesCount = faceLists.reduce((sum, list) => sum + list.keys.length, 0);
  const totalFaces = listFacesCount + whitelist.length;
  if (totalFaces > MAX_WHITELIST_FILES) {
    throw badRequest("At most 20 whitelist faces per batch", "VALIDATION_ERROR");
  }

  const batchId = randomUUID();
  const whitelistKeys: string[] = [];
  const whitelistNames: Record<string, string> = {};
  try {
    // Push each list's own keys directly into whitelistKeys (no copy) and snapshot names
    for (const faceList of faceLists) {
      const listNames = parseFaceNamesMap(faceList.faceNames);

      for (const sourceKey of faceList.keys) {
        whitelistKeys.push(sourceKey);
        const faceName = listNames[sourceKey];
        if (typeof faceName === "string" && faceName.trim().length > 0) {
          whitelistNames[sourceKey] = faceName;
        }
      }
    }

    // Then save directly uploaded whitelist files in order
    let uploadedFaceIndex = 1;
    for (const file of whitelist) {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const key = `${batchId}/whitelist/face-${uploadedFaceIndex}${ext}`;
      await storage.putObject(UPLOADS_BUCKET, key, file.buffer, file.mimetype);
      whitelistKeys.push(key);
      const displayName = sanitizeFaceFileName(file.originalname);
      if (displayName) {
        whitelistNames[key] = displayName;
      }
      uploadedFaceIndex++;
    }

    const createdBatch = await createDraftBatchRepository({
      id: batchId,
      userId: options.userId,
      name: validatedName,
      config: batchConfig,
      whitelistKeys,
      whitelistNames,
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
 * Creates a new draft batch using original image inputs from a previous batch with fresh settings.
 *
 * Why server-side copy: Duplicating original inputs into the new batch's S3 namespace keeps contract §5
 * path isolation intact so deleting either batch never affects the other, avoiding client re-upload overhead.
 * Why draft is unstarted: Enables the caller to add additional images before starting processing.
 */
export async function rerunBatch(
  sourceId: string,
  options: {
    whitelist?: Express.Multer.File[];
    faceListIds?: string[];
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
    faceListIds: options.faceListIds,
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

    const currentDraft = await getBatch(draftBatch.id);
    const currentJobs = await getJobsByBatchId(draftBatch.id);

    return {
      batch: toBatchResponse(currentDraft!, currentJobs),
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

export async function retryFailedJob(
  id: string,
  userId?: string,
  options?: { acceptMissingFaces?: boolean },
): Promise<JobResponseDTO> {
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
  if (!(await storage.objectExists(UPLOADS_BUCKET, failedJob.inputKey))) {
    throw gone("Original input has expired and cannot be retried", "INPUT_EXPIRED");
  }

  const activeRetry = await getActiveRetryJob(failedJob);
  if (activeRetry) {
    return toJobResponse(activeRetry)!;
  }

  const survivingKeys: string[] = [];
  for (const whitelistKey of batch.whitelistKeys) {
    if (await storage.objectExists(UPLOADS_BUCKET, whitelistKey)) {
      survivingKeys.push(whitelistKey);
    }
  }

  const missingCount = batch.whitelistKeys.length - survivingKeys.length;
  if (missingCount > 0 && !options?.acceptMissingFaces) {
    throw conflict("Some whitelist faces are no longer available", "WHITELIST_FACES_MISSING", {
      missing: missingCount,
      total: batch.whitelistKeys.length,
    });
  }

  const whitelistRefs =
    survivingKeys.length < batch.whitelistKeys.length
      ? survivingKeys.map((key) => batch.whitelistKeys.indexOf(key))
      : [];

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
    whitelistRefs,
  };
  await insertRetryJob(retryJob);

  try {
    const command = buildImageRedactCommand({
      jobId: retryJob.id,
      batchId: retryJob.batchId,
      inputKey: retryJob.inputKey,
      outputKey: retryJob.outputKey,
      config: batchConfig,
      whitelistKeys: survivingKeys,
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

/**
 * Streams the batch's nth reference whitelist photo (1-based index).
 *
 * Why owner-scoped: Whitelist reference images contain biometric profile data that must remain
 * strictly private to the user account that uploaded or referenced them.
 * Why 404 on missing object: Directly uploaded faces are purged on batch completion, or referenced
 * allow lists/faces may have been deleted, rendering the reference photo unavailable.
 */
export async function getBatchWhitelistStream(
  batchId: string,
  index: number,
  userId: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType?: string; contentLength?: number }> {
  if (!UUID_REGEX.test(batchId)) {
    throw notFound("Batch not found");
  }

  const batch = await getBatchOwnedByUser(batchId, userId);
  if (!batch) {
    throw notFound("Batch not found");
  }

  const keys = Array.isArray(batch.whitelistKeys) ? batch.whitelistKeys : [];
  if (index < 1 || index > keys.length) {
    throw notFound("Whitelist photo not found");
  }

  const key = keys[index - 1]!;
  const streamInfo = await storage.getObjectStream(UPLOADS_BUCKET, key);
  if (!streamInfo) {
    throw notFound("Whitelist photo not found");
  }

  return streamInfo;
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

  let eventPayload = event;
  if (
    current.whitelistRefs &&
    current.whitelistRefs.length > 0 &&
    event.status === "COMPLETED" &&
    event.resultSummary?.detections
  ) {
    eventPayload = {
      ...event,
      resultSummary: {
        ...event.resultSummary,
        detections: event.resultSummary.detections.map((detection) => {
          if (
            typeof detection.whitelistRef === "number" &&
            current.whitelistRefs[detection.whitelistRef] !== undefined
          ) {
            return {
              ...detection,
              whitelistRef: current.whitelistRefs[detection.whitelistRef],
            };
          }
          return detection;
        }),
      },
    };
  }

  const nextState = calculateNextJobState(currentState, eventPayload, config.PUBLIC_RESULTS_BASE_URL);

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
