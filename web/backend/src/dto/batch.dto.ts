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
  resultUrl: string | null;
  resultSummary: Record<string, unknown> | null;
  error: JobError | null;
  createdAt: string;
  updatedAt: string;
}

export type ReviewReason =
  | "Low confidence"
  | "Similarity near whitelist threshold"
  | "Engine reported needsReview";

export interface BatchResponseDTO {
  id: string;
  status: string;
  config: BatchConfig;
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
  needsReview: boolean;
  reviewReasons: ReviewReason[];
  lowestRedactedConfidence: number | null;
  reviewDetections: ReportDetectionDTO[];
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
  reviewReasons: ReviewReason[];
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
  reviewImages: Array<{
    jobId: string;
    originalFilename: string;
    reviewReasons: ReviewReason[];
  }>;
  reviewDetections: ReportLowConfidenceDetectionDTO[];
}

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
    config: configParsed,
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

    let summary: ImageResultSummary | null = null;
    if (job.resultSummary) {
      const parsed = imageResultSummarySchema.safeParse(job.resultSummary);
      if (parsed.success) {
        summary = parsed.data;
      }
    }

    const summaryCounts = summary?.counts ?? null;
    const rawDetections = summary?.detections ?? [];
    const detections = rawDetections.map((raw) => toReportDetection(raw, batchConfig.similarityThreshold));
    const reviewDetections = detections.filter((detection) => detection.reviewReasons.length > 0);
    const reviewReasons = [...new Set(reviewDetections.flatMap((detection) => detection.reviewReasons))];
    const redactedConfidences = detections.flatMap((detection) =>
      detection.redacted === true && detection.confidence !== null && detection.confidence !== undefined
        ? [detection.confidence]
        : [],
    );
    const lowestRedactedConfidence = redactedConfidences.length > 0 ? Math.min(...redactedConfidences) : null;
    if (summaryCounts) {
      if (typeof summaryCounts.face === "number") faces += summaryCounts.face;
      if (typeof summaryCounts.plate === "number") plates += summaryCounts.plate;
      if (typeof summaryCounts.redacted === "number") redacted += summaryCounts.redacted;
      const wl = summaryCounts.whitelistedFace ?? summaryCounts.whitelisted ?? 0;
      if (typeof wl === "number") whitelisted += wl;
      if (typeof summaryCounts.lowConfidence === "number") lowConfidence += summaryCounts.lowConfidence;
    }
    for (const detection of detections) {
      if (detection.lowConfidence === true) {
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
      counts: summaryCounts,
      detections,
      needsReview: reviewReasons.length > 0,
      reviewReasons,
      lowestRedactedConfidence,
      reviewDetections,
      model: summary?.model ?? null,
      processingTimeMs: summary?.processingTimeMs ?? null,
      similarityThreshold: batchConfig.similarityThreshold,
      error: job.error,
    };
  });

  const reviewImages = perImage
    .filter((image) => image.needsReview)
    .map(({ jobId, originalFilename, reviewReasons }) => ({ jobId, originalFilename, reviewReasons }));
  const reviewDetections = perImage.flatMap((image) =>
    image.reviewDetections.map((detection) => ({
      ...detection,
      jobId: image.jobId,
      originalFilename: image.originalFilename,
    })),
  );

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
    reviewImages,
    reviewDetections,
  };
}

function toReportDetection(
  detection: ImageDetectionSummary,
  similarityThreshold: number,
): ReportDetectionDTO {
  const similarity = typeof detection.similarity === "number" ? detection.similarity : null;
  const nearThreshold =
    similarity === null ? null : Math.abs(similarity - similarityThreshold) <= 0.05;
  const reviewReasons: ReviewReason[] = [];
  if (detection.lowConfidence === true) reviewReasons.push("Low confidence");
  if (detection.needsReview === true) reviewReasons.push("Engine reported needsReview");
  if (nearThreshold === true) reviewReasons.push("Similarity near whitelist threshold");

  return {
    label: detection.label ?? null,
    confidence: typeof detection.confidence === "number" ? detection.confidence : null,
    box: detection.box ?? null,
    redacted: typeof detection.redacted === "boolean" ? detection.redacted : null,
    whitelisted: typeof detection.whitelisted === "boolean" ? detection.whitelisted : null,
    whitelistRef: typeof detection.whitelistRef === "number" ? detection.whitelistRef : null,
    similarity,
    lowConfidence: typeof detection.lowConfidence === "boolean" ? detection.lowConfidence : null,
    needsReview: typeof detection.needsReview === "boolean" ? detection.needsReview : null,
    similarityNearThreshold: nearThreshold,
    reviewReasons,
  };
}
