import { z } from "zod";
import { Batch as PrismaBatch, Job as PrismaJob } from "../generated/prisma/client";
import { deriveBatchStatus } from "../domain/batch-status";
import { parseBatchConfig } from "./batch-config.dto";

const resultSummarySchema = z.record(z.string(), z.unknown());
const jobErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .passthrough();

export interface JobResponseDTO {
  id: string;
  batchId: string;
  originalFilename: string;
  status: string;
  progress: number;
  stage: string | null;
  resultUrl: string | null;
  resultSummary: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchResponseDTO {
  id: string;
  status: string;
  config: Record<string, unknown>;
  whitelistKeys: string[];
  whitelistDeletedAt: string | null;
  createdAt: string;
  jobs: JobResponseDTO[];
}

export interface ReportImageDTO {
  jobId: string;
  originalFilename: string;
  status: string;
  counts: Record<string, number> | null;
  error: unknown | null;
}

export interface ReportTotalsDTO {
  images: number;
  completed: number;
  failed: number;
  faces: number;
  plates: number;
  redacted: number;
  whitelisted: number;
  lowConfidence: number;
}

export interface ReportResponseDTO {
  batchId: string;
  status: string;
  totals: ReportTotalsDTO;
  images: ReportImageDTO[];
}

export function toJobResponse(job: PrismaJob): JobResponseDTO;
export function toJobResponse(job: PrismaJob | null): JobResponseDTO | null;
export function toJobResponse(job: PrismaJob | null): JobResponseDTO | null {
  if (!job) return null;

  let summary: Record<string, unknown> | null = null;
  if (job.resultSummary) {
    const parsed = resultSummarySchema.safeParse(job.resultSummary);
    summary = parsed.success ? parsed.data : (job.resultSummary as Record<string, unknown>);
  }

  let err: { code: string; message: string } | null = null;
  if (job.error) {
    const parsed = jobErrorSchema.safeParse(job.error);
    err = parsed.success ? (parsed.data as { code: string; message: string }) : (job.error as { code: string; message: string });
  }

  return {
    id: job.id,
    batchId: job.batchId,
    originalFilename: job.originalFilename,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    resultUrl: job.resultUrl,
    resultSummary: summary,
    error: err,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt),
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : String(job.updatedAt),
  };
}

export function toBatchResponse(batch: PrismaBatch, jobs: PrismaJob[]): BatchResponseDTO {
  const configParsed = parseBatchConfig(batch.config);
  return {
    id: batch.id,
    status: deriveBatchStatus(jobs.map((j) => j.status)),
    config: configParsed as unknown as Record<string, unknown>,
    whitelistKeys: batch.whitelistKeys,
    whitelistDeletedAt: batch.whitelistDeletedAt
      ? (batch.whitelistDeletedAt instanceof Date ? batch.whitelistDeletedAt.toISOString() : String(batch.whitelistDeletedAt))
      : null,
    createdAt: batch.createdAt instanceof Date ? batch.createdAt.toISOString() : String(batch.createdAt),
    jobs: jobs.map((j) => toJobResponse(j)!),
  };
}

export function toReportResponse(batch: PrismaBatch, jobs: PrismaJob[]): ReportResponseDTO {
  const images = jobs.length;
  let completed = 0;
  let failed = 0;
  let faces = 0;
  let plates = 0;
  let redacted = 0;
  let whitelisted = 0;
  let lowConfidence = 0;

  const perImage: ReportImageDTO[] = jobs.map((job) => {
    if (job.status === "COMPLETED") completed++;
    if (job.status === "FAILED") failed++;

    const summary = job.resultSummary as Record<string, unknown> | null;
    const summaryCounts = (summary?.counts as Record<string, number> | undefined) ?? undefined;
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
      originalFilename: job.originalFilename,
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
