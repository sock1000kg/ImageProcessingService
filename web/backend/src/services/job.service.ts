import path from "node:path";

import { randomUUID } from "node:crypto";

import { config } from "../config";
import { getJob, insertJob, updateJobQueued } from "../db";
import { publishJob } from "../messaging";
import { storage, UPLOADS_BUCKET } from "../storage";
import { JOB_TYPES, JobType } from "../types";
import { z } from "zod";

const objectDetectionParamsSchema = z.object({
  confidenceThreshold: z.coerce.number().min(0).max(1).default(0.35),
}).strict();

const imageConvertParamsSchema = z.object({
  targetFormat: z.enum(["JPEG", "PNG", "WEBP"]).default("JPEG"),
  quality: z.coerce.number().int().min(1).max(100).default(85),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
}).strict();

export function parseParams(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") throw new Error("params must be a JSON object");
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("params must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function outputExtension(type: JobType, params: Record<string, unknown>): string {
  if (type === "object-detection") return "jpg";
  const target = String(params.targetFormat ?? "JPEG").toLowerCase();
  return target === "jpeg" ? "jpg" : target;
}

function validateParams(type: JobType, params: Record<string, unknown>): Record<string, unknown> {
  const schema = type === "object-detection" ? objectDetectionParamsSchema : imageConvertParamsSchema;
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new Error(`Invalid ${type} params: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }
  return result.data;
}

export async function createJob(file: Express.Multer.File, rawType: unknown, rawParams: unknown) {
  const type = String(rawType);
  if (!JOB_TYPES.includes(type as JobType)) {
    throw new Error(`type must be one of: ${JOB_TYPES.join(", ")}`);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
    throw new Error("Only JPEG, PNG, and WEBP images are supported");
  }

  const params = validateParams(type as JobType, parseParams(rawParams));
  const jobId = randomUUID();
  const inputKey = `${jobId}/input${path.extname(file.originalname).toLowerCase() || ".bin"}`;
  const outputKey = `${jobId}/result.${outputExtension(type as JobType, params)}`;

  await storage.putObject(UPLOADS_BUCKET, inputKey, file.buffer, file.size, {
    "Content-Type": file.mimetype,
  });
  await insertJob({ id: jobId, type, originalFilename: file.originalname, inputKey, outputKey });

  try {
    await publishJob(type === "object-detection" ? "jobs.ai" : "jobs.image", {
      jobId,
      type,
      input: { bucket: UPLOADS_BUCKET, key: inputKey },
      output: { bucket: "results", key: outputKey },
      params,
    });
    await updateJobQueued(jobId);
  } catch (error) {
    console.error(`Failed to publish job ${jobId}`, error);
    throw Object.assign(new Error("Job queue is unavailable"), { statusCode: 503, jobId });
  }

  return getJob(jobId);
}

export function serializeJob(job: Awaited<ReturnType<typeof getJob>>) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
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

export const uploadMaxBytes = config.UPLOAD_MAX_BYTES;
