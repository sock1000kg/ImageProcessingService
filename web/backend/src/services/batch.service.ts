import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config";
import {
  addJobToBatchWithLock,
  createDraftBatch as createDraftBatchRepository,
  deleteJob,
  deleteBatchRow,
  getActiveRetryJob,
  getBatch,
  getExpiredBatches,
  getJob,
  getJobsByBatchId,
  getPendingJobsByBatchId,
  insertBatchAndJobs,
  insertRetryJob,
  markBatchWhitelistDeleted,
  setBatchStarted,
  updateJobQueued,
  updateJobState,
} from "../repositories/job.repository";
import { publishJob } from "../messaging";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../storage";
import { BatchConfig } from "../types";
import { JobStatus } from "../generated/prisma/client";
import {
  buildImageRedactCommand,
  calculateNextJobState,
  JobState,
  resolveOutputExtension,
} from "../domain";
import {
  BatchResponseDTO,
  JobResponseDTO,
  parseBatchConfig,
  parseBatchConfigJson,
  ReportResponseDTO,
  toBatchResponse,
  toJobResponse,
  toReportResponse,
  validateBatchCreation,
  validateSingleUploadFile,
  validateUploadFiles,
  ValidatedJobEvent,
} from "../dto";
import { badRequest, conflict, gone, notFound, unavailable } from "../errors";

export async function createDraftBatch(options: {
  whitelist?: Express.Multer.File[];
  rawConfig?: unknown;
  filesPresent?: boolean;
}): Promise<BatchResponseDTO> {
  const { whitelist = [], rawConfig, filesPresent = false } = options;

  validateBatchCreation({ filesPresent, whitelist });

  const batchConfig: BatchConfig = parseBatchConfigJson(rawConfig);
  const batchId = randomUUID();

  const whitelistKeys: string[] = [];
  try {
    for (let i = 0; i < whitelist.length; i++) {
      const file = whitelist[i]!;
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const key = `${batchId}/whitelist/face-${i + 1}${ext}`;
      await storage.putObject(UPLOADS_BUCKET, key, file.buffer, file.mimetype);
      whitelistKeys.push(key);
    }

    const createdBatch = await createDraftBatchRepository({
      id: batchId,
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
): Promise<JobResponseDTO> {
  const validFile = validateSingleUploadFile(file);

  const batch = await getBatch(batchId);
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

export async function startBatch(batchId: string): Promise<BatchResponseDTO> {
  const batch = await getBatch(batchId);
  if (!batch) {
    throw notFound("Batch not found");
  }

  const jobs = await getJobsByBatchId(batchId);
  if (jobs.length === 0) {
    throw badRequest("Batch has no jobs", "BATCH_EMPTY");
  }

  if (batch.startedAt === null) {
    await setBatchStarted(batchId);
  }

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

export async function getBatchById(id: string): Promise<BatchResponseDTO | null> {
  const batch = await getBatch(id);
  if (!batch) return null;
  const jobs = await getJobsByBatchId(id);
  return toBatchResponse(batch, jobs);
}

export async function getBatchReportById(id: string): Promise<ReportResponseDTO | null> {
  const batch = await getBatch(id);
  if (!batch) return null;
  const jobs = await getJobsByBatchId(id);
  return toReportResponse(batch, jobs);
}

export async function deleteBatchById(id: string): Promise<boolean> {
  const batch = await getBatch(id);
  if (!batch) return false;

  await storage.deletePrefix(UPLOADS_BUCKET, `${id}/`);
  await storage.deletePrefix(RESULTS_BUCKET, `${id}/`);
  await deleteBatchRow(id);
  return true;
}

export async function getJobById(id: string): Promise<JobResponseDTO | null> {
  const job = await getJob(id);
  return toJobResponse(job);
}

export async function retryFailedJob(id: string): Promise<JobResponseDTO> {
  const failedJob = await getJob(id);
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
  if (batch.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
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

export async function getJobOriginalStream(id: string) {
  const job = await getJob(id);
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

  await updateJobState(event.jobId, {
    status: nextState.status,
    progress: nextState.progress,
    stage: nextState.stage,
    resultUrl: nextState.resultUrl,
    resultSummary: nextState.resultSummary,
    error: nextState.error,
  });
}

export async function checkAndCleanBatchWhitelist(batchId: string): Promise<void> {
  const batch = await getBatch(batchId);
  if (!batch || batch.startedAt === null || batch.whitelistDeletedAt !== null) {
    return;
  }

  const jobs = await getJobsByBatchId(batchId);
  if (jobs.length === 0) {
    return;
  }

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
