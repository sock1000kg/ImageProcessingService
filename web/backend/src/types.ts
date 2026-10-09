export const JOB_TYPES = ["object-detection", "image-convert"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type JobStatus = "PENDING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface JobEvent {
  jobId: string;
  status: JobStatus;
  progress?: number;
  stage?: string;
  result?: { bucket: string; key: string };
  resultSummary?: Record<string, unknown>;
  error?: { code: string; message: string };
  timestamp?: string;
}

export interface JobRow {
  id: string;
  type: JobType;
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
