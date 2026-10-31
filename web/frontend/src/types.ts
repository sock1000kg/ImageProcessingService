/**
 * Core domain types and API contract definitions for the image processing frontend.
 */

/**
 * Single image redaction job within a batch.
 */
export type Job = {
  id: string;
  batchId?: string;
  originalFilename: string;
  status: string;
  progress: number;
  stage: string | null;
  resultUrl: string | null;
  resultSummary: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Machine learning detection box and review telemetry for faces or license plates.
 */
export type Detection = {
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
  reviewNotes?: string[];
};

/**
 * Diagnostic reason why an image or detection was flagged for human review.
 */
export type ReviewReason = "Low confidence" | "Similarity near whitelist threshold" | "Engine reported needsReview";

/**
 * Image record in the advanced batch report with detection summary and review flags.
 */
export type ReportImage = {
  jobId: string;
  originalFilename: string;
  status: string;
  counts: Record<string, number> | null;
  detections: Detection[];
  needsReview: boolean;
  reviewReasons: ReviewReason[];
  reviewNotes?: string[];
  lowestRedactedConfidence: number | null;
  reviewDetections: Detection[];
  model: string | null;
  processingTimeMs: number | null;
  similarityThreshold: number | null;
  error: { code?: string; message?: string } | null;
  attempts?: number;
};

/**
 * Failure diagnosis entry for jobs that could not be processed.
 */
export type ReportFailedImage = {
  jobId: string;
  originalFilename: string;
  code: string;
  message: string;
  attempts: number;
};

/**
 * Biometric reference summary tracing detection appearances of whitelisted individuals.
 */
export type ReportWhitelistPerson = {
  whitelistRef: number;
  whitelistKey: string;
  images: Array<{ jobId: string; originalFilename: string }>;
  imageCount: number;
  detectionCount: number;
};

/**
 * Benchmark telemetry for image processing latencies.
 */
export type ReportProcessingTime = {
  total: number;
  mean: number;
  max: number;
};

/**
 * Comprehensive batch report response containing detection aggregates and review lists.
 */
export type BatchReport = {
  batchId: string;
  batchName?: string;
  status: string;
  totals: {
    images: number;
    completed: number;
    failed: number;
    faces: number;
    plates: number;
    redacted: number;
    whitelisted: number;
    lowConfidence: number;
  };
  images: ReportImage[];
  failedImages?: ReportFailedImage[];
  whitelistPeople?: ReportWhitelistPerson[];
  lowConfidenceDetections: Array<Detection & { jobId: string; originalFilename: string }>;
  reviewImages: Array<{
    jobId: string;
    originalFilename: string;
    reviewReasons: ReviewReason[];
    reviewNotes?: string[];
  }>;
  reviewDetections: Array<Detection & { jobId: string; originalFilename: string }>;
  models?: string[];
  processingTimeMs?: ReportProcessingTime | null;
};

/**
 * Lifecycle status of a processing batch.
 */
export type BatchStatus = "DRAFT" | "PROCESSING" | "COMPLETED" | "PARTIAL";

/**
 * Processing batch model representing a grouping of image jobs.
 */
export type Batch = {
  id: string;
  name: string;
  status: BatchStatus | string;
  config: Record<string, unknown>;
  whitelistKeys: string[];
  whitelistDeletedAt: string | null;
  startedAt?: string | null;
  createdAt: string;
  jobs: Job[];
};
