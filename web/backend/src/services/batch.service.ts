import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config";
import {
  deleteBatchRow,
  getBatch,
  getJob,
  getJobsByBatchId,
  insertBatchAndJobs,
  updateJobQueued,
} from "../db";
import { publishJob } from "../messaging";
import { storage, RESULTS_BUCKET, UPLOADS_BUCKET } from "../storage";
import { BatchConfig, BatchRow, JobRow } from "../types";
import {
  buildImageRedactCommand,
  deriveBatchStatus,
  parseBatchConfigJson,
  resolveOutputExtension,
} from "../batch-logic";

export function serializeJob(job: JobRow | null) {
  if (!job) return null;
  return {
    id: job.id,
    batchId: job.batch_id,
    originalFilename: job.original_filename,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    resultUrl: job.result_url,
    resultSummary: job.result_summary,
    error: job.error,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

export function serializeBatch(batch: BatchRow, jobs: JobRow[]) {
  return {
    id: batch.id,
    status: deriveBatchStatus(jobs.map((j) => j.status)),
    config: batch.config,
    whitelistKeys: batch.whitelist_keys,
    whitelistDeletedAt: batch.whitelist_deleted_at,
    createdAt: batch.created_at,
    jobs: jobs.map(serializeJob),
  };
}

export function buildBatchReport(batch: BatchRow, jobs: JobRow[]) {
  let images = jobs.length;
  let completed = 0;
  let failed = 0;
  let faces = 0;
  let plates = 0;
  let redacted = 0;
  let whitelisted = 0;
  let lowConfidence = 0;

  const perImage = jobs.map((job) => {
    if (job.status === "COMPLETED") completed++;
    if (job.status === "FAILED") failed++;

    const summaryCounts = (job.result_summary?.counts as Record<string, number> | undefined) ?? undefined;
    if (summaryCounts) {
      if (typeof summaryCounts.face === "number") faces += summaryCounts.face;
      if (typeof summaryCounts.plate === "number") plates += summaryCounts.plate;
      if (typeof summaryCounts.redacted === "number") redacted += summaryCounts.redacted;
      const wl = summaryCounts.whitelistedFace ?? summaryCounts.whitelisted ?? 0;
      if (typeof wl === "number") whitelisted += wl;
      if (typeof summaryCounts.lowConfidence === "number") lowConfidence += summaryCounts.lowConfidence;
    }

    return {
      jobId: job.id,
      originalFilename: job.original_filename,
      status: job.status,
      counts: summaryCounts ?? null,
      error: job.error,
    };
  });

  return {
    batchId: batch.id,
    status: deriveBatchStatus(jobs.map((j) => j.status)),
    totals: {
      images,
      completed,
      failed,
      faces,
      plates,
      redacted,
      whitelisted,
      lowConfidence,
    },
    images: perImage,
  };
}

export async function createBatch(options: {
  files: Express.Multer.File[];
  whitelist?: Express.Multer.File[];
  rawConfig?: unknown;
}) {
  const { files, whitelist = [], rawConfig } = options;

  if (!files || files.length === 0) {
    throw Object.assign(new Error("At least one image file is required"), { statusCode: 400 });
  }
  if (files.length > config.BATCH_MAX_FILES) {
    throw Object.assign(
      new Error(`Too many files: maximum allowed is ${config.BATCH_MAX_FILES}`),
      { statusCode: 400 },
    );
  }
  if (whitelist.length > 5) {
    throw Object.assign(
      new Error("Too many whitelist files: maximum allowed is 5"),
      { statusCode: 400 },
    );
  }

  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw Object.assign(
        new Error(`File ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`),
        { statusCode: 413 },
      );
    }
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw Object.assign(
        new Error(`File ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`),
        { statusCode: 400 },
      );
    }
  }

  for (const file of whitelist) {
    totalBytes += file.size;
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw Object.assign(
        new Error(`Whitelist file ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`),
        { statusCode: 413 },
      );
    }
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw Object.assign(
        new Error(`Whitelist file ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`),
        { statusCode: 400 },
      );
    }
  }

  if (totalBytes > config.BATCH_MAX_BYTES) {
    throw Object.assign(
      new Error(`Total upload size exceeds ${config.BATCH_MAX_BYTES} bytes`),
      { statusCode: 413 },
    );
  }

  let batchConfig: BatchConfig;
  try {
    batchConfig = parseBatchConfigJson(rawConfig);
  } catch (error) {
    throw Object.assign(
      new Error(error instanceof Error ? error.message : "Invalid batch config"),
      { statusCode: 400 },
    );
  }

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
      throw Object.assign(new Error("Job queue is unavailable"), { statusCode: 503 });
    }
  }

  const createdBatch = await getBatch(batchId);
  const createdJobs = await getJobsByBatchId(batchId);
  return serializeBatch(createdBatch!, createdJobs);
}

export async function getBatchById(id: string) {
  const batch = await getBatch(id);
  if (!batch) return null;
  const jobs = await getJobsByBatchId(id);
  return serializeBatch(batch, jobs);
}

export async function getBatchReportById(id: string) {
  const batch = await getBatch(id);
  if (!batch) return null;
  const jobs = await getJobsByBatchId(id);
  return buildBatchReport(batch, jobs);
}

export async function deleteBatchById(id: string): Promise<boolean> {
  const batch = await getBatch(id);
  if (!batch) return false;

  await storage.deletePrefix(UPLOADS_BUCKET, `${id}/`);
  await storage.deletePrefix(RESULTS_BUCKET, `${id}/`);
  await deleteBatchRow(id);
  return true;
}

export async function getJobById(id: string) {
  const job = await getJob(id);
  return serializeJob(job);
}

export async function getJobOriginalStream(id: string) {
  const job = await getJob(id);
  if (!job) return null;
  const streamInfo = await storage.getObjectStream(UPLOADS_BUCKET, job.input_key);
  if (!streamInfo) return null;
  return {
    ...streamInfo,
    filename: job.original_filename,
  };
}
