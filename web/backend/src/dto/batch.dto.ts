/**
 * Batch and job data transfer objects and their serializers.
 */
import { z } from "zod";
import { Batch as PrismaBatch, Job as PrismaJob } from "../generated/prisma/client";
import { deriveBatchStatus } from "../domain/batch-status";
import { BatchConfig, parseBatchConfig } from "./batch-config.dto";

export const jobErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .passthrough();

export type JobError = z.infer<typeof jobErrorSchema>;

export const imageDetectionSummarySchema = z
  .object({
    label: z.string().optional(),
    confidence: z.number().optional(),
    box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    redacted: z.boolean().optional(),
    whitelisted: z.boolean().optional(),
    lowConfidence: z.boolean().optional(),
    similarity: z.number().optional(),
    whitelistRef: z.number().int().optional(),
    needsReview: z.boolean().optional(),
  })
  .passthrough();

export type ImageDetectionSummary = z.infer<typeof imageDetectionSummarySchema>;

export const imageResultSummarySchema = z
  .object({
    counts: z.record(z.string(), z.number()).optional(),
    detections: z.array(imageDetectionSummarySchema).optional(),
    model: z.string().optional(),
    processingTimeMs: z.number().optional(),
  })
  .passthrough();

export type ImageResultSummary = z.infer<typeof imageResultSummarySchema>;

export interface JobResponseDTO {
  id: string;
  batchId: string;
  originalFilename: string;
  status: string;
  progress: number;
  stage: string | null;
  resultSummary: Record<string, unknown> | null;
  error: JobError | null;
  replacesJobId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchResponseDTO {
  id: string;
  name: string;
  status: string;
  config: BatchConfig;
  whitelistKeys: string[];
  whitelistDeletedAt: string | null;
  startedAt: string | null;
  createdAt: string;
  jobs: JobResponseDTO[];
}

export interface BatchSummaryItemDTO {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  jobCounts: {
    total: number;
    completed: number;
    failed: number;
  };
  thumbnailUrl: string | null;
  hasVideo: boolean;
  bytes: number;
}

export interface AccountUsageDTO {
  bytes: number;
  batches: number;
  jobs: number;
}

export interface BatchListResponseDTO {
  batches: BatchSummaryItemDTO[];
  nextCursor: string | null;
  usage: AccountUsageDTO;
}

export const listBatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export function toJobResponse(job: PrismaJob): JobResponseDTO;
export function toJobResponse(job: PrismaJob | null): JobResponseDTO | null;
export function toJobResponse(job: PrismaJob | null): JobResponseDTO | null {
  if (!job) return null;

  let summary: Record<string, unknown> | null = null;
  if (job.resultSummary) {
    const parsed = imageResultSummarySchema.safeParse(job.resultSummary);
    summary = parsed.success
      ? (parsed.data as Record<string, unknown>)
      : (job.resultSummary as Record<string, unknown>);
  }

  let err: JobError | null = null;
  if (job.error) {
    const parsed = jobErrorSchema.safeParse(job.error);
    err = parsed.success ? parsed.data : (job.error as { code: string; message: string });
  }

  return {
    id: job.id,
    batchId: job.batchId,
    originalFilename: job.originalFilename,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    resultSummary: summary,
    error: err,
    replacesJobId: job.replacesJobId ?? null,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt),
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : String(job.updatedAt),
  };
}

export function toBatchResponse(batch: PrismaBatch, jobs: PrismaJob[]): BatchResponseDTO {
  const configParsed = parseBatchConfig(batch.config);
  return {
    id: batch.id,
    name: batch.name,
    status: deriveBatchStatus(
      jobs.map((j) => j.status),
      batch.startedAt,
    ),
    config: configParsed,
    whitelistKeys: batch.whitelistKeys,
    whitelistDeletedAt: batch.whitelistDeletedAt
      ? batch.whitelistDeletedAt instanceof Date
        ? batch.whitelistDeletedAt.toISOString()
        : String(batch.whitelistDeletedAt)
      : null,
    startedAt: batch.startedAt
      ? batch.startedAt instanceof Date
        ? batch.startedAt.toISOString()
        : String(batch.startedAt)
      : null,
    createdAt: batch.createdAt instanceof Date ? batch.createdAt.toISOString() : String(batch.createdAt),
    jobs: jobs.map((j) => toJobResponse(j)!),
  };
}
