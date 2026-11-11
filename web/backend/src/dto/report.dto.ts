/**
 * Batch report: per-image and per-detection results, totals, and the rules for what needs review.
 */
import { Batch as PrismaBatch, Job as PrismaJob } from "../generated/prisma/client";
import { deriveBatchStatus } from "../domain/batch-status";
import { parseBatchConfig } from "./batch-config.dto";
import {
  jobErrorSchema,
  JobError,
  ImageDetectionSummary,
  imageResultSummarySchema,
  ImageResultSummary,
} from "./batch.dto";
import { rangesOf, formatRange, videoTracksAsDetections, videoTrackFields } from "./report-video.dto";

export type ReviewReason =
  "Low confidence" | "Similarity near whitelist threshold" | "Engine reported needsReview" | "Possible redaction gap";

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
  largestReviewFaceWidth: number | null;
  reviewDetections: ReportDetectionDTO[];
  model: string | null;
  processingTimeMs: number | null;
  similarityThreshold: number | null;
  error: JobError | null;
  attempts: number;
  createdAt: string;
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
  /** Video only: the track this detection stands for and the time span (ms) it is visible. */
  trackId?: number;
  startMs?: number;
  endMs?: number;
  /** Video only: the frame (ms) where `box` was measured, the one moment the box is accurate. */
  bestFrameMs?: number;
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
  name: string | null;
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

  // Why latest-attempt dedup: When a failed image is retried, each attempt generates a distinct
  // database row referencing the same originalFilename. To prevent double-counting totals or
  // displaying outdated failures, we deduplicate by originalFilename and take only the latest attempt
  // (sorted by createdAt DESC with id as tie-break), preserving total attempt count for diagnostics.
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
    // A video summary has `tracks` instead of per-frame `detections`; each track is reviewed like one detection.
    const rawDetections = summary?.detections ?? videoTracksAsDetections(summary?.tracks);
    const detections = rawDetections.map((raw) => toReportDetection(raw, batchConfig.similarityThreshold));
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
    // A video can have dozens of flagged tracks; the viewer lists them, so the report row is just the file.
    const reviewNotes = Array.isArray(summary?.tracks) ? [] : [...keptFaceNotes, ...otherNotes];

    const redactedConfidences = detections.flatMap((detection) =>
      detection.redacted === true && detection.confidence !== null && detection.confidence !== undefined
        ? [detection.confidence]
        : [],
    );
    const lowestRedactedConfidence = redactedConfidences.length > 0 ? Math.min(...redactedConfidences) : null;

    const reviewFaceWidths = reviewDetections.flatMap((detection) => {
      if (detection.label === "face" && Array.isArray(detection.box) && detection.box.length >= 4) {
        const width = Math.abs(detection.box[2] - detection.box[0]);
        return Number.isFinite(width) ? [width] : [];
      }
      return [];
    });
    const largestReviewFaceWidth = reviewFaceWidths.length > 0 ? Math.max(...reviewFaceWidths) : null;

    const isVideo = Array.isArray(summary?.tracks);
    if (summaryCounts) {
      // Video summaries count tracks (faceTracks, ...) under different names than the per-image counts.
      const count = (image: string, video: string) => summaryCounts[image] ?? summaryCounts[video];
      const face = count("face", "faceTracks");
      const plate = count("plate", "plateTracks");
      const redactedCount = count("redacted", "redactedTracks");
      const wl = summaryCounts.whitelistedFace ?? summaryCounts.whitelistedFaceTracks ?? summaryCounts.whitelisted ?? 0;
      const low = count("lowConfidence", "lowConfidenceTracks");
      if (typeof face === "number") faces += face;
      if (typeof plate === "number") plates += plate;
      if (typeof redactedCount === "number") redacted += redactedCount;
      if (typeof wl === "number") whitelisted += wl;
      // For video the raw engine count includes tiny background faces, so it is counted from the tracks below.
      if (typeof low === "number" && !isVideo) lowConfidence += low;
    }
    for (const detection of detections) {
      if (isVideo) {
        if (detection.reviewReasons.includes("Low confidence")) lowConfidence++;
      } else if (detection.lowConfidence === true) {
        if (
          !summaryCounts ||
          (typeof summaryCounts.lowConfidence !== "number" && typeof summaryCounts.lowConfidenceTracks !== "number")
        ) {
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
      largestReviewFaceWidth,
      reviewDetections,
      model: summary?.model ?? null,
      processingTimeMs: summary?.processingTimeMs ?? null,
      similarityThreshold: batchConfig.similarityThreshold,
      error: err,
      attempts,
      createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt),
    };
  });

  // Why report sort order: Reviewers must prioritize images that need human oversight first.
  // The sorting algorithm ranks failed jobs first, then review candidates (prioritizing similarity
  // near whitelist threshold first to avoid exposing faces, then largest flagged face width descending
  // with null last, then lowest redacted confidence ascending), followed by non-review images,
  // using createdAt and originalFilename as deterministic tie-breaks.
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
  const whitelistNamesMap =
    typeof batch.whitelistNames === "object" && batch.whitelistNames !== null && !Array.isArray(batch.whitelistNames)
      ? (batch.whitelistNames as Record<string, unknown>)
      : {};

  const whitelistPeople: ReportWhitelistPersonDTO[] = whitelistKeys.map((key, index) => {
    const rawName = whitelistNamesMap[key];
    const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName : null;
    return {
      whitelistRef: index,
      whitelistKey: key,
      name,
      images: [],
      imageCount: 0,
      detectionCount: 0,
    };
  });

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
      completedImages.map((img) => img.model).filter((m): m is string => typeof m === "string" && m.trim().length > 0),
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
    status: deriveBatchStatus(
      latestJobsWithAttempts.map((j) => j.job.status),
      batch.startedAt,
    ),
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
    if (img.status === "FAILED") return 0;
    if (img.needsReview) {
      return 1;
    }
    return 2;
  };

  const groupA = getGroup(a);
  const groupB = getGroup(b);

  if (groupA !== groupB) {
    return groupA - groupB;
  }

  // Why review candidate ordering: Images requiring review prioritize similarity near whitelist
  // threshold first (misclassification risks leaking familiar faces), then largest flagged face
  // width descending with null last (larger faces are more critical/recognisable), then lowest
  // redacted confidence ascending.
  if (groupA === 1) {
    const simA = a.reviewReasons.includes("Similarity near whitelist threshold") ? 1 : 0;
    const simB = b.reviewReasons.includes("Similarity near whitelist threshold") ? 1 : 0;
    if (simA !== simB) {
      return simB - simA;
    }

    const widthA = a.largestReviewFaceWidth;
    const widthB = b.largestReviewFaceWidth;
    if (widthA !== null && widthB !== null) {
      if (widthA !== widthB) {
        return widthB - widthA;
      }
    } else if (widthA !== null) {
      return -1;
    } else if (widthB !== null) {
      return 1;
    }
  }

  const confA = a.lowestRedactedConfidence ?? Number.POSITIVE_INFINITY;
  const confB = b.lowestRedactedConfidence ?? Number.POSITIVE_INFINITY;
  if (confA !== confB) {
    return confA - confB;
  }

  const createdCmp = a.createdAt.localeCompare(b.createdAt);
  if (createdCmp !== 0) {
    return createdCmp;
  }

  const filenameCmp = a.originalFilename.localeCompare(b.originalFilename);
  if (filenameCmp !== 0) {
    return filenameCmp;
  }

  return a.jobId.localeCompare(b.jobId);
}

/**
 * Minimum face bounding box width (in pixels) required to raise a "Low confidence" review reason.
 *
 * Why: A low confidence box under this width is mostly background noise,
 * while faces from about 16 px up are still recognisable.
 */
export const REVIEW_MIN_FACE_WIDTH_PX = 16;

function toReportDetection(detection: ImageDetectionSummary, similarityThreshold: number): ReportDetectionDTO {
  const similarity = typeof detection.similarity === "number" ? detection.similarity : null;
  const nearThreshold = similarity === null ? null : Math.abs(similarity - similarityThreshold) <= 0.05;

  const isFace = detection.label === "face";
  const hasBox = Array.isArray(detection.box) && detection.box.length >= 4;
  const boxWidth = hasBox ? Math.abs(detection.box![2] - detection.box![0]) : null;
  // Why: A low confidence box under 16 px width is mostly background noise, while faces from about 16 px up
  // are still recognisable. Non-faces or detections without boxes retain low-confidence review flags.
  const qualifiesLowConfidence = !isFace || !hasBox || (boxWidth !== null && boxWidth >= REVIEW_MIN_FACE_WIDTH_PX);

  const reviewReasons: ReviewReason[] = [];
  if (detection.lowConfidence === true && qualifiesLowConfidence) reviewReasons.push("Low confidence");
  if (detection.needsReview === true) reviewReasons.push("Engine reported needsReview");
  // Video only: stretches where the tracker lost the object, so it may not have been redacted there.
  const gapRanges = qualifiesLowConfidence ? rangesOf(detection, "gapRanges") : [];
  if (gapRanges.length > 0) reviewReasons.push("Possible redaction gap");
  if (nearThreshold === true) reviewReasons.push("Similarity near whitelist threshold");

  const reviewNotes: string[] = [];
  if (detection.lowConfidence === true && qualifiesLowConfidence) {
    const lowRanges = rangesOf(detection, "lowConfidenceRanges");
    if (lowRanges.length > 0) {
      // A video track's average can look fine; what is low is the stretches below the review threshold.
      reviewNotes.push(`low confidence at ${lowRanges.map(formatRange).join(", ")}`);
    } else {
      const confStr = typeof detection.confidence === "number" ? ` ${detection.confidence.toFixed(2)}` : "";
      reviewNotes.push(`low confidence${confStr}`);
    }
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
  if (gapRanges.length > 0) {
    reviewNotes.push(`may be unredacted at ${gapRanges.map(formatRange).join(", ")}`);
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
    ...videoTrackFields(detection),
  };
}
