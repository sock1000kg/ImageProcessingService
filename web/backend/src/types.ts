export type JobStatus = "PENDING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

export type BatchStatus = "PROCESSING" | "COMPLETED" | "PARTIAL";

export type RedactionTarget = "face" | "plate";
export type RedactionStyle = "blur" | "pixelate" | "blackout";
export type OutputQuality = "standard" | "high" | "max";
export type OutputFormat = "original" | "jpg" | "jpeg" | "png" | "webp";

export interface BatchConfig {
  targets: RedactionTarget[];
  style: RedactionStyle;
  strength?: number;
  padding: number;
  quality: OutputQuality;
  format: OutputFormat;
  confidenceThreshold: number;
  reviewThreshold: number;
  similarityThreshold: number;
}

export interface JobEvent {
  jobId: string;
  batchId?: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  progress?: number;
  stage?: string;
  result?: { bucket: string; key: string };
  resultSummary?: Record<string, unknown>;
  error?: { code: string; message: string };
  timestamp?: string;
}
