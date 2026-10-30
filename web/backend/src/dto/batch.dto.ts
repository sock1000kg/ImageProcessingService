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
  detections: ReportDetectionDTO[];
  model: string | null;
  processingTimeMs: number | null;
  similarityThreshold: number | null;
  error: unknown | null;
}

export interface ReportDetectionDTO {
  label: string | null;
  confidence: number | null;
  box: number[] | null;
  redacted: boolean | null;
  whitelisted: boolean | null;
  whitelistRef: number | null;
  similarity: number | null;
  lowConfidence: boolean | null;
  needsReview: boolean | null;
  similarityNearThreshold: boolean | null;
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

export interface ReportLowConfidenceDetectionDTO extends ReportDetectionDTO {
  jobId: string;
  originalFilename: string;
}

export interface ReportResponseDTO {
  batchId: string;
  status: string;
  totals: ReportTotalsDTO;
  images: ReportImageDTO[];
  lowConfidenceDetections: ReportLowConfidenceDetectionDTO[];
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
  const lowConfidenceDetections: ReportLowConfidenceDetectionDTO[] = [];
  const batchConfig = parseBatchConfig(batch.config);

  const perImage: ReportImageDTO[] = jobs.map((job) => {
    if (job.status === "COMPLETED") completed++;
    if (job.status === "FAILED") failed++;

    const summary = isRecord(job.resultSummary) ? job.resultSummary : null;
    const summaryCounts = isNumberRecord(summary?.counts) ? summary.counts : undefined;
    const rawDetections = Array.isArray(summary?.detections) ? summary.detections : [];
    const detections = rawDetections.map((raw) => toReportDetection(raw, batchConfig.similarityThreshold));
    if (summaryCounts) {
      if (typeof summaryCounts.face === "number") faces += summaryCounts.face;
      if (typeof summaryCounts.plate === "number") plates += summaryCounts.plate;
      if (typeof summaryCounts.redacted === "number") redacted += summaryCounts.redacted;
      const wl = summaryCounts.whitelistedFace ?? summaryCounts.whitelisted ?? 0;
      if (typeof wl === "number") whitelisted += wl;
      if (typeof summaryCounts.lowConfidence === "number") lowConfidence += summaryCounts.lowConfidence;
    }
    for (const detection of detections) {
      if (detection.lowConfidence === true || detection.needsReview === true) {
        if (!summaryCounts || typeof summaryCounts.lowConfidence !== "number") {
          lowConfidence++;
        }
        lowConfidenceDetections.push({
          ...detection,
          jobId: job.id,
          originalFilename: job.originalFilename,
        });
      }
    }

    return {
      jobId: job.id,
      originalFilename: job.originalFilename,
      status: job.status,
      counts: summaryCounts ?? null,
      detections,
      model: typeof summary?.model === "string" ? summary.model : null,
      processingTimeMs: typeof summary?.processingTimeMs === "number" ? summary.processingTimeMs : null,
      similarityThreshold: batchConfig.similarityThreshold,
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
    lowConfidenceDetections,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "number");
}

function toReportDetection(value: unknown, similarityThreshold: number): ReportDetectionDTO {
  const detection = isRecord(value) ? value : {};
  const similarity = typeof detection.similarity === "number" ? detection.similarity : null;
  const nearThreshold =
    similarity === null ? null : Math.abs(similarity - similarityThreshold) <= 0.05;

  return {
    label: typeof detection.label === "string" ? detection.label : null,
    confidence: typeof detection.confidence === "number" ? detection.confidence : null,
    box:
      Array.isArray(detection.box) && detection.box.every((item) => typeof item === "number")
        ? detection.box
        : null,
    redacted: typeof detection.redacted === "boolean" ? detection.redacted : null,
    whitelisted: typeof detection.whitelisted === "boolean" ? detection.whitelisted : null,
    whitelistRef: typeof detection.whitelistRef === "number" ? detection.whitelistRef : null,
    similarity,
    lowConfidence: typeof detection.lowConfidence === "boolean" ? detection.lowConfidence : null,
    needsReview: typeof detection.needsReview === "boolean" ? detection.needsReview : null,
    similarityNearThreshold: nearThreshold,
  };
}
