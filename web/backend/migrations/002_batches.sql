DROP TABLE IF EXISTS jobs;

CREATE TABLE batches (
  id UUID PRIMARY KEY,
  config JSONB NOT NULL,
  whitelist_keys TEXT[] NOT NULL DEFAULT '{}',
  whitelist_deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  input_key TEXT NOT NULL,
  output_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage TEXT,
  result_url TEXT,
  result_summary JSONB,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_batch_id ON jobs (batch_id);
CREATE INDEX idx_jobs_status ON jobs (status);
CREATE INDEX idx_jobs_created_at ON jobs (created_at DESC);
CREATE INDEX idx_batches_created_at ON batches (created_at DESC);
