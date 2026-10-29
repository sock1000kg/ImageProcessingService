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

export type Batch = {
  id: string;
  status: string;
  config: Record<string, unknown>;
  whitelistKeys: string[];
  whitelistDeletedAt: string | null;
  createdAt: string;
  jobs: Job[];
};
