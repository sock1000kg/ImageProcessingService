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
  name: string;
  status: string;
  config: BatchConfig;
  whitelistKeys: string[];
  whitelistDeletedAt: string | null;
  startedAt: string | null;
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
  reviewNotes: string[];
  lowestRedactedConfidence: number | null;
  reviewDetections: ReportDetectionDTO[];
  model: string | null;
  processingTimeMs: number | null;
  similarityThreshold: number | null;
  error: JobError | null;
  attempts: number;
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
  reviewNotes: string[];
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

export interface ReportFailedImageDTO {
  jobId: string;
  originalFilename: string;
  code: string;
  message: string;
  attempts: number;
}

export interface ReportWhitelistPersonDTO {
  whitelistRef: number;
  whitelistKey: string;
  images: Array<{
    jobId: string;
    originalFilename: string;
  }>;
  imageCount: number;
  detectionCount: number;
}

export interface ReportProcessingTimeDTO {
  total: number;
  mean: number;
  max: number;
}

export interface ReportResponseDTO {
  batchId: string;
  batchName: string;
  status: string;
  totals: ReportTotalsDTO;
  images: ReportImageDTO[];
  failedImages: ReportFailedImageDTO[];
  whitelistPeople: ReportWhitelistPersonDTO[];
  lowConfidenceDetections: ReportLowConfidenceDetectionDTO[];
  reviewImages: Array<{
    jobId: string;
    originalFilename: string;
    reviewReasons: ReviewReason[];
    reviewNotes: string[];
  }>;
  reviewDetections: ReportLowConfidenceDetectionDTO[];
  models: string[];
  processingTimeMs: ReportProcessingTimeDTO | null;
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
    name: batch.name,
    status: deriveBatchStatus(jobs.map((j) => j.status), batch.startedAt),
    config: configParsed,
    whitelistKeys: batch.whitelistKeys,
    whitelistDeletedAt: batch.whitelistDeletedAt
      ? (batch.whitelistDeletedAt instanceof Date ? batch.whitelistDeletedAt.toISOString() : String(batch.whitelistDeletedAt))
      : null,
    startedAt: batch.startedAt
      ? (batch.startedAt instanceof Date ? batch.startedAt.toISOString() : String(batch.startedAt))
      : null,
    createdAt: batch.createdAt instanceof Date ? batch.createdAt.toISOString() : String(batch.createdAt),
    jobs: jobs.map((j) => toJobResponse(j)!),
  };
}

export function toReportResponse(batch: PrismaBatch, jobs: PrismaJob[]): ReportResponseDTO {
  // 1. Latest attempt per image: group by inputKey (fallback to id), newest createdAt then id
  const groups = new Map<string, PrismaJob[]>();
  for (const job of jobs) {
    const key = job.inputKey || job.id;
    const list = groups.get(key);
    if (list) {
      list.push(job);
    } else {
      groups.set(key, [job]);
    }
  }

  const getTime = (d: Date | string | number | undefined | null): number => {
    if (d instanceof Date) return d.getTime();
    if (typeof d === "string" || typeof d === "number") return new Date(d).getTime();
    return 0;
  };

  const latestJobsWithAttempts: Array<{ job: PrismaJob; attempts: number }> = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const diff = getTime(b.createdAt) - getTime(a.createdAt);
      if (diff !== 0) return diff;
      return String(b.id).localeCompare(String(a.id));
    });
    latestJobsWithAttempts.push({
      job: group[0],
      attempts: group.length,
    });
  }

  const batchConfig = parseBatchConfig(batch.config);

  let completed = 0;
  let failed = 0;
  let faces = 0;
  let plates = 0;
  let redacted = 0;
  let whitelisted = 0;
  let lowConfidence = 0;

  const perImage: ReportImageDTO[] = latestJobsWithAttempts.map(({ job, attempts }) => {
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
    const detections = rawDetections.map((raw) =>
      toReportDetection(raw, batchConfig.similarityThreshold),
    );
    const reviewDetections = detections.filter((detection) => detection.reviewReasons.length > 0);
    const reviewReasons = [...new Set(reviewDetections.flatMap((detection) => detection.reviewReasons))];

    // Image notes: unique detection notes, kept-face notes first
    const keptFaceNotes: string[] = [];
    const otherNotes: string[] = [];
    for (const detection of detections) {
      for (const note of detection.reviewNotes) {
        if (note.startsWith("kept face")) {
          if (!keptFaceNotes.includes(note)) keptFaceNotes.push(note);
        } else {
          if (!otherNotes.includes(note)) otherNotes.push(note);
        }
      }
    }
    const reviewNotes = [...keptFaceNotes, ...otherNotes];

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
      }
    }

    let err: JobError | null = null;
    if (job.error) {
      const parsed = jobErrorSchema.safeParse(job.error);
      if (parsed.success) {
        err = parsed.data;
      } else if (typeof job.error === "object" && job.error !== null) {
        const obj = job.error as Record<string, unknown>;
        err = {
          code: typeof obj.code === "string" ? obj.code : "UNKNOWN_ERROR",
          message: typeof obj.message === "string" ? obj.message : JSON.stringify(job.error),
        };
      } else {
        err = {
          code: "UNKNOWN_ERROR",
          message: String(job.error),
        };
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
      reviewNotes,
      lowestRedactedConfidence,
      reviewDetections,
      model: summary?.model ?? null,
      processingTimeMs: summary?.processingTimeMs ?? null,
      similarityThreshold: batchConfig.similarityThreshold,
      error: err,
      attempts,
    };
  });

  // Sort images: needsReview first, then lowestRedactedConfidence ascending, then images with null,
  // then FAILED images, with originalFilename as tie-break.
  perImage.sort(compareReportImages);

  const lowConfidenceDetections: ReportLowConfidenceDetectionDTO[] = [];
  const reviewDetections: ReportLowConfidenceDetectionDTO[] = [];
  const reviewImages: Array<{
    jobId: string;
    originalFilename: string;
    reviewReasons: ReviewReason[];
    reviewNotes: string[];
  }> = [];

  for (const image of perImage) {
    if (image.needsReview) {
      reviewImages.push({
        jobId: image.jobId,
        originalFilename: image.originalFilename,
        reviewReasons: image.reviewReasons,
        reviewNotes: image.reviewNotes,
      });
    }

    for (const detection of image.detections) {
      if (detection.lowConfidence === true) {
        lowConfidenceDetections.push({
          ...detection,
          jobId: image.jobId,
          originalFilename: image.originalFilename,
        });
      }
    }

    for (const detection of image.reviewDetections) {
      reviewDetections.push({
        ...detection,
        jobId: image.jobId,
        originalFilename: image.originalFilename,
      });
    }
  }

  const failedImages: ReportFailedImageDTO[] = perImage
    .filter((image) => image.status === "FAILED")
    .map((image) => ({
      jobId: image.jobId,
      originalFilename: image.originalFilename,
      code: image.error?.code ?? "UNKNOWN_ERROR",
      message: image.error?.message ?? "Job failed",
      attempts: image.attempts,
    }));

  const whitelistKeys = Array.isArray(batch.whitelistKeys) ? batch.whitelistKeys : [];
  const whitelistPeople: ReportWhitelistPersonDTO[] = whitelistKeys.map((key, index) => ({
    whitelistRef: index,
    whitelistKey: key,
    images: [],
    imageCount: 0,
    detectionCount: 0,
  }));

  for (const image of perImage) {
    const seenRefs = new Set<number>();
    for (const detection of image.detections) {
      if (detection.whitelisted === true && typeof detection.whitelistRef === "number") {
        const ref = detection.whitelistRef;
        if (ref < 0 || ref >= whitelistKeys.length) {
          console.warn(`whitelistRef ${ref} is outside the range of whitelistKeys (0..${whitelistKeys.length - 1})`);
          continue;
        }
        whitelistPeople[ref].detectionCount++;
        if (!seenRefs.has(ref)) {
          seenRefs.add(ref);
          whitelistPeople[ref].images.push({
            jobId: image.jobId,
            originalFilename: image.originalFilename,
          });
        }
      }
    }
  }

  for (const person of whitelistPeople) {
    person.imageCount = person.images.length;
  }

  const completedImages = perImage.filter((img) => img.status === "COMPLETED");
  const models = [
    ...new Set(
      completedImages
        .map((img) => img.model)
        .filter((m): m is string => typeof m === "string" && m.trim().length > 0),
    ),
  ];

  const processingTimes = completedImages
    .map((img) => img.processingTimeMs)
    .filter((t): t is number => typeof t === "number" && !Number.isNaN(t));

  let processingTimeMs: ReportProcessingTimeDTO | null = null;
  if (processingTimes.length > 0) {
    const total = processingTimes.reduce((acc, t) => acc + t, 0);
    const mean = Math.round((total / processingTimes.length) * 100) / 100;
    const max = Math.max(...processingTimes);
    processingTimeMs = { total, mean, max };
  }

  return {
    batchId: batch.id,
    batchName: batch.name,
    status: deriveBatchStatus(latestJobsWithAttempts.map((j) => j.job.status), batch.startedAt),
    totals: {
      images: perImage.length,
      completed,
      failed,
      faces,
      plates,
      redacted,
      whitelisted,
      lowConfidence,
    },
    images: perImage,
    failedImages,
    whitelistPeople,
    lowConfidenceDetections,
    reviewImages,
    reviewDetections,
    models,
    processingTimeMs,
  };
}

function compareReportImages(a: ReportImageDTO, b: ReportImageDTO): number {
  const getGroup = (img: ReportImageDTO): number => {
    if (img.status === "FAILED") return 5;
    if (img.needsReview) {
      return img.lowestRedactedConfidence !== null ? 1 : 2;
    }
    return img.lowestRedactedConfidence !== null ? 3 : 4;
  };

  const groupA = getGroup(a);
  const groupB = getGroup(b);

  if (groupA !== groupB) {
    return groupA - groupB;
  }

  if (groupA === 1 || groupA === 3) {
    const confA = a.lowestRedactedConfidence!;
    const confB = b.lowestRedactedConfidence!;
    if (confA !== confB) {
      return confA - confB;
    }
  }

  const filenameCmp = a.originalFilename.localeCompare(b.originalFilename);
  if (filenameCmp !== 0) {
    return filenameCmp;
  }

  return a.jobId.localeCompare(b.jobId);
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

  const reviewNotes: string[] = [];
  if (detection.lowConfidence === true) {
    const confStr = typeof detection.confidence === "number" ? ` ${detection.confidence.toFixed(2)}` : "";
    reviewNotes.push(`low confidence${confStr}`);
  }
  if (nearThreshold === true) {
    const simStr = typeof similarity === "number" ? similarity.toFixed(2) : "0.00";
    const threshStr = similarityThreshold.toFixed(2);
    if (detection.whitelisted === true) {
      reviewNotes.push(`kept face near whitelist threshold (similarity ${simStr}, threshold ${threshStr})`);
    } else {
      reviewNotes.push(`redacted face near whitelist threshold (similarity ${simStr}, threshold ${threshStr})`);
    }
  }
  if (detection.needsReview === true) {
    reviewNotes.push("engine flagged for review");
  }

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
    reviewNotes,
  };
}
