import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config";
import {
  countNonTerminalJobs,
  deleteBatchRow,
  getBatch,
  getJob,
  getJobsByBatchId,
  insertBatchAndJobs,
  markBatchWhitelistDeleted,
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
  parseBatchConfigJson,
  ReportResponseDTO,
  toBatchResponse,
  toJobResponse,
  toReportResponse,
  ValidatedJobEvent,
} from "../dto";
import { badRequest, payloadTooLarge, unavailable } from "../errors";

export { toBatchResponse, toJobResponse, toReportResponse };
export const serializeJob = toJobResponse;
export const serializeBatch = toBatchResponse;
export const buildBatchReport = toReportResponse;

export async function createBatch(options: {
  files: Express.Multer.File[];
  whitelist?: Express.Multer.File[];
  rawConfig?: unknown;
}): Promise<BatchResponseDTO> {
  const { files, whitelist = [], rawConfig } = options;

  if (!files || files.length === 0) {
    throw badRequest("At least one image file is required");
  }
  if (files.length > config.BATCH_MAX_FILES) {
    throw badRequest(`Too many files: maximum allowed is ${config.BATCH_MAX_FILES}`);
  }
  if (whitelist.length > 5) {
    throw badRequest("Too many whitelist files: maximum allowed is 5");
  }

  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `File ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`,
        "FILE_TOO_LARGE",
      );
    }
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw badRequest(
        `File ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }

  for (const file of whitelist) {
    totalBytes += file.size;
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `Whitelist file ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`,
        "FILE_TOO_LARGE",
      );
    }
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw badRequest(
        `Whitelist file ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }

  if (totalBytes > config.BATCH_MAX_BYTES) {
    throw payloadTooLarge(
      `Total upload size exceeds ${config.BATCH_MAX_BYTES} bytes`,
      "FILE_TOO_LARGE",
    );
  }

  const batchConfig: BatchConfig = parseBatchConfigJson(rawConfig);
  const batchId = randomUUID();

  // Upload whitelist files
  const whitelistKeys: string[] = [];
  for (let i = 0; i < whitelist.length; i++) {
    const file = whitelist[i]!;
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const key = `${batchId}/whitelist/face-${i + 1}${ext}`;
    await storage.putObject(UPLOADS_BUCKET, key, file.buffer, file.mimetype);
    whitelistKeys.push(key);
  }

  // Upload input files and prepare jobs
  const jobsToInsert: Array<{
    id: string;
    originalFilename: string;
    inputKey: string;
    outputKey: string;
  }> = [];

  for (const file of files) {
    const jobId = randomUUID();
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const inputKey = `${batchId}/${jobId}/input${ext}`;
    const outExt = resolveOutputExtension(batchConfig.format, file.originalname);
    const outputKey = `${batchId}/${jobId}/result.${outExt}`;

    await storage.putObject(UPLOADS_BUCKET, inputKey, file.buffer, file.mimetype);

    jobsToInsert.push({
      id: jobId,
      originalFilename: file.originalname,
      inputKey,
      outputKey,
    });
  }

  // Insert batch and jobs into database
  await insertBatchAndJobs(
    {
      id: batchId,
      config: batchConfig,
      whitelistKeys,
    },
    jobsToInsert,
  );

  // Publish image-redact command for each job on jobs.image
  for (const job of jobsToInsert) {
    const command = buildImageRedactCommand({
      jobId: job.id,
      batchId,
      inputKey: job.inputKey,
      outputKey: job.outputKey,
      config: batchConfig,
      whitelistKeys,
    });

    try {
      await publishJob("jobs.image", command as unknown as Record<string, unknown>);
      await updateJobQueued(job.id);
    } catch (error) {
      console.error(`Failed to publish command for job ${job.id}`, error);
      throw unavailable("Job queue is unavailable");
    }
  }

  const createdBatch = await getBatch(batchId);
  const createdJobs = await getJobsByBatchId(batchId);
  return toBatchResponse(createdBatch!, createdJobs);
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
    status: current.status as any,
    progress: current.progress,
    stage: current.stage,
    resultUrl: current.resultUrl,
    resultSummary: current.resultSummary as Record<string, unknown> | null,
    error: current.error as { code: string; message: string } | null,
  };

  const nextState = calculateNextJobState(currentState, event, config.PUBLIC_RESULTS_BASE_URL);

  await updateJobState(event.jobId, {
    status: nextState.status as JobStatus,
    progress: nextState.progress,
    stage: nextState.stage,
    resultUrl: nextState.resultUrl,
    resultSummary: nextState.resultSummary,
    error: nextState.error,
  });
}

export async function checkAndCleanBatchWhitelist(batchId: string): Promise<void> {
  const remainingNonTerminal = await countNonTerminalJobs(batchId);
  if (remainingNonTerminal > 0) {
    return;
  }

  const batch = await getBatch(batchId);
  if (!batch || batch.whitelistDeletedAt !== null) {
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
