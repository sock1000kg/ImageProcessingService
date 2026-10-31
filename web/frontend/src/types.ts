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
};

export type ReviewReason =
  | "Low confidence"
  | "Similarity near whitelist threshold"
  | "Engine reported needsReview";

export type ReportImage = {
  jobId: string;
  originalFilename: string;
  status: string;
  counts: Record<string, number> | null;
  detections: Detection[];
  needsReview: boolean;
  reviewReasons: ReviewReason[];
  lowestRedactedConfidence: number | null;
  reviewDetections: Detection[];
  model: string | null;
  processingTimeMs: number | null;
  similarityThreshold: number | null;
  error: { code?: string; message?: string } | null;
};

export type BatchReport = {
  batchId: string;
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
  lowConfidenceDetections: Array<Detection & { jobId: string; originalFilename: string }>;
  reviewImages: Array<{ jobId: string; originalFilename: string; reviewReasons: ReviewReason[] }>;
  reviewDetections: Array<Detection & { jobId: string; originalFilename: string }>;
};

export type BatchStatus = "DRAFT" | "PROCESSING" | "COMPLETED" | "PARTIAL";

export type Batch = {
  id: string;
  status: BatchStatus | string;
  config: Record<string, unknown>;
  whitelistKeys: string[];
  whitelistDeletedAt: string | null;
  startedAt?: string | null;
  createdAt: string;
  jobs: Job[];
};
