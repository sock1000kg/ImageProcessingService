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

export interface JobRow {
  id: string;
  batch_id: string;
  original_filename: string;
  input_key: string;
  output_key: string;
  status: JobStatus;
  progress: number;
  stage: string | null;
  result_url: string | null;
  result_summary: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  created_at: string;
  updated_at: string;
}

export interface BatchRow {
  id: string;
  config: BatchConfig;
  whitelist_keys: string[];
  whitelist_deleted_at: string | null;
  created_at: string;
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
