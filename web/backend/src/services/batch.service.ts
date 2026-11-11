/**
 * Batch lifecycle: create drafts, add files, start, rename, rerun, list and delete batches.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config";
import {
  addJobToBatchWithLock,
  batchHasActiveJobs,
  createDraftBatch as createDraftBatchRepository,
  deleteBatchRowOwnedByUser,
  getAccountUsage,
  getBatch,
  getBatchOwnedByUser,
  getJobsByBatchId,
  getPendingJobsByBatchId,
  listBatchesByUserId,
  setBatchStarted,
  updateBatchName,
  updateJobQueued,
} from "../repositories/job.repository";
import { getFaceListOwnedByUser } from "../repositories/face-list.repository";
import { parseFaceNamesMap, sanitizeFaceFileName } from "./face-list.service";
import { publishJob } from "../messaging";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../storage";
import { abortBatchUploads } from "./upload-cleanup.service";
import { BatchConfig } from "../types";
import { JobStatus } from "../generated/prisma/client";
import { buildImageRedactCommand, buildVideoRedactCommand, deriveBatchStatus, resolveOutputExtension } from "../domain";
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
} from "../dto";
import { assertImageContents } from "../media-types";
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
  userId: string;
}): Promise<BatchResponseDTO> {
  const { whitelist = [], rawConfig, filesPresent = false, name } = options;
  const faceListIds = parseFaceListIds(options);

  validateBatchCreation({ filesPresent, whitelist, faceListIds });
  await assertImageContents(whitelist, "Whitelist file");

  const batchConfig: BatchConfig = parseBatchConfigJson(rawConfig);
  const validatedName = parseBatchName(name);

  // Validate all face lists first (UUID and ownership) BEFORE any storage or DB writes
  const faceLists: Array<{ id: string; name: string; keys: string[]; faceNames?: unknown }> = [];
  if (faceListIds && faceListIds.length > 0) {
    for (const id of faceListIds) {
      if (!UUID_REGEX.test(id)) {
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
  file: Express.Multer.File | undefined,
  userId: string,
): Promise<JobResponseDTO> {
  const validFile = validateSingleUploadFile(file);
  await assertImageContents([validFile]);

  const batch = await getBatchOwnedByUser(batchId, userId);
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

export async function addBatchStoredObject(
  batchId: string,
  file: { originalFilename: string; inputKey: string; inputBytes: number; contentType: string },
  userId: string,
): Promise<JobResponseDTO> {
  const batch = await getBatchOwnedByUser(batchId, userId);
  if (!batch) throw notFound("Batch not found");
  if (batch.startedAt !== null) throw conflict("Batch has already been started", "BATCH_STARTED");
  const batchConfig = parseBatchConfig(batch.config);
  const jobId = randomUUID();
  const ext = path.extname(file.originalFilename).toLowerCase() || ".jpg";
  const outputExt = ext === ".mp4" ? "mp4" : resolveOutputExtension(batchConfig.format, file.originalFilename);
  const job = await addJobToBatchWithLock(batchId, {
    id: jobId,
    originalFilename: file.originalFilename,
    inputKey: file.inputKey,
    outputKey: `${batchId}/${jobId}/result.${outputExt}`,
    inputBytes: file.inputBytes,
  });
  return toJobResponse(job);
}

/**
 * Starts a draft batch by publishing all pending image jobs to the NATS worker queue.
 *
 * Why start idempotency: Calling startBatch repeatedly is safe and idempotent. If a caller clicks
 * "Start without them" or retries a failed start call, only jobs remaining in PENDING status are
 * enqueued. startedAt is marked once, avoiding duplicate command dispatches to workers.
 */
export async function startBatch(batchId: string, userId: string): Promise<BatchResponseDTO> {
  const batch = await getBatchOwnedByUser(batchId, userId);
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
    const isVideo = path.extname(job.originalFilename).toLowerCase() === ".mp4";
    const command = (isVideo ? buildVideoRedactCommand : buildImageRedactCommand)({
      jobId: job.id,
      batchId: batch.id,
      inputKey: job.inputKey,
      outputKey: job.outputKey,
      config: batchConfig,
      whitelistKeys: batch.whitelistKeys,
    });

    try {
      await publishJob(isVideo ? "jobs.video" : "jobs.image", command);
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

export async function getBatchById(id: string, userId: string): Promise<BatchResponseDTO | null> {
  const batch = await getBatchOwnedByUser(id, userId);
  if (!batch) return null;
  const jobs = await getJobsByBatchId(id);
  return toBatchResponse(batch, jobs);
}

export async function renameBatch(id: string, rawName: string, userId: string): Promise<BatchResponseDTO> {
  const batch = await getBatchOwnedByUser(id, userId);
  if (!batch) {
    throw notFound("Batch not found");
  }
  const name = batchNameSchema.parse(rawName);
  const updated = await updateBatchName(id, name);
  const jobs = await getJobsByBatchId(id);
  return toBatchResponse(updated, jobs);
}

export async function getBatchReportById(id: string, userId: string): Promise<ReportResponseDTO | null> {
  const batch = await getBatchOwnedByUser(id, userId);
  if (!batch) return null;
  const jobs = await getJobsByBatchId(id);
  return toReportResponse(batch, jobs);
}

export async function deleteBatchById(id: string, userId: string): Promise<boolean> {
  const batch = await getBatchOwnedByUser(id, userId);
  if (!batch) return false;

  // The Engine reads a job's input once and writes its result when done, so deleting the files under a running job
  // would leave a result nobody can find or remove. Same rule as deleting a single job.
  if (await batchHasActiveJobs(id)) {
    throw conflict("Cannot delete a batch while it is processing", "BATCH_ACTIVE");
  }

  // Unfinished video uploads hold parts in storage that deleting the prefix below does not remove.
  await abortBatchUploads(id);
  await storage.deletePrefix(UPLOADS_BUCKET, `${id}/`);
  await storage.deletePrefix(RESULTS_BUCKET, `${id}/`);
  return deleteBatchRowOwnedByUser(id, userId);
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
    userId: string;
  },
): Promise<{ batch: BatchResponseDTO; skipped: number }> {
  const sourceBatch = await getBatchOwnedByUser(sourceId, options.userId);

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

  const items: BatchSummaryItemDTO[] = await Promise.all(
    pageBatches.map(async (batch) => {
      const jobs = batch.jobs;
      const total = jobs.length;
      const completed = jobs.filter((j) => j.status === JobStatus.COMPLETED).length;
      const failed = jobs.filter((j) => j.status === JobStatus.FAILED).length;
      const status = deriveBatchStatus(
        jobs.map((j) => j.status),
        batch.startedAt,
      );
      // Why presigned thumbnail: Signs thumbnail inline for library browsing with result TTL
      const firstCompleted = jobs.find((j) => j.status === JobStatus.COMPLETED && j.outputKey);
      let thumbnailUrl: string | null = null;
      if (firstCompleted?.outputKey) {
        const signed = await storage.presignGetUrl(RESULTS_BUCKET, firstCompleted.outputKey, {
          ttlSeconds: config.PRESIGN_RESULT_TTL_SECONDS,
        });
        thumbnailUrl = signed.url;
      }
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
    }),
  );

  const usage = await getAccountUsage(userId);

  return {
    batches: items,
    nextCursor,
    usage,
  };
}
