import { QueryResultRow } from "pg";

import { pool } from "../db/pool";
import { config } from "../config";
import { JobEvent, JobRow } from "../types";

const terminalStatuses = new Set(["COMPLETED", "FAILED"]);

export async function insertJob(job: {
  id: string;
  type: string;
  originalFilename: string;
  inputKey: string;
  outputKey: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO jobs (id, type, original_filename, input_key, output_key, status)
     VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
    [job.id, job.type, job.originalFilename, job.inputKey, job.outputKey],
  );
}

export async function updateJobQueued(id: string): Promise<void> {
  await pool.query(
    `UPDATE jobs SET status = 'QUEUED', updated_at = NOW()
     WHERE id = $1 AND status = 'PENDING'`,
    [id],
  );
}

export async function getJob(id: string): Promise<JobRow | null> {
  const result = await pool.query<JobRow>("SELECT * FROM jobs WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function listJobs(limit = 50): Promise<JobRow[]> {
  const result = await pool.query<JobRow>(
    "SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1",
    [Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows;
}

export async function applyJobEvent(event: JobEvent): Promise<void> {
  const result = await pool.query<{ status: JobRow["status"]; progress: number }>(
    "SELECT status, progress FROM jobs WHERE id = $1",
    [event.jobId],
  );
  const current = result.rows[0];
  if (!current || terminalStatuses.has(current.status)) return;

  const progress = Math.max(current.progress, Math.min(100, event.progress ?? current.progress));
  await pool.query(
    `UPDATE jobs
     SET status = $2, progress = $3, stage = COALESCE($4, stage),
         result_url = CASE WHEN $2 = 'COMPLETED' THEN $5 ELSE result_url END,
         result_summary = CASE WHEN $2 = 'COMPLETED' THEN $6 ELSE result_summary END,
         error = CASE WHEN $2 = 'FAILED' THEN $7 ELSE error END,
         updated_at = NOW()
     WHERE id = $1 AND status NOT IN ('COMPLETED', 'FAILED')`,
    [
      event.jobId,
      event.status,
      progress,
      event.stage ?? null,
      event.result ? `${config.PUBLIC_RESULTS_BASE_URL}/${event.result.key}` : null,
      event.resultSummary ?? null,
      event.error ?? null,
    ],
  );
}

export async function getStats(): Promise<Record<string, number>> {
  const result = await pool.query<QueryResultRow>(
    "SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status",
  );
  return Object.fromEntries(result.rows.map((row) => [row.status, row.count]));
}
