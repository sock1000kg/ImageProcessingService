import { QueryResultRow } from "pg";
import { pool } from "../db/pool";
import { config } from "../config";
import { BatchConfig, BatchRow, JobRow } from "../types";
import { ValidatedJobEvent } from "../schemas/job-event.schema";
import { calculateNextJobState, JobState } from "../batch-logic";
import { storage, UPLOADS_BUCKET } from "../storage";

export async function insertBatchAndJobs(
  batch: {
    id: string;
    config: BatchConfig;
    whitelistKeys: string[];
  },
  jobs: Array<{
    id: string;
    originalFilename: string;
    inputKey: string;
    outputKey: string;
  }>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO batches (id, config, whitelist_keys)
       VALUES ($1, $2, $3)`,
      [batch.id, JSON.stringify(batch.config), batch.whitelistKeys],
    );

    for (const job of jobs) {
      await client.query(
        `INSERT INTO jobs (id, batch_id, original_filename, input_key, output_key, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [job.id, batch.id, job.originalFilename, job.inputKey, job.outputKey],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

export async function getBatch(id: string): Promise<BatchRow | null> {
  const result = await pool.query<BatchRow>("SELECT * FROM batches WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function getJobsByBatchId(batchId: string): Promise<JobRow[]> {
  const result = await pool.query<JobRow>(
    "SELECT * FROM jobs WHERE batch_id = $1 ORDER BY created_at ASC",
    [batchId],
  );
  return result.rows;
}

export async function deleteBatchRow(id: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM batches WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function applyJobEvent(event: ValidatedJobEvent): Promise<void> {
  const result = await pool.query<JobRow>(
    "SELECT * FROM jobs WHERE id = $1",
    [event.jobId],
  );
  const current = result.rows[0];
  if (!current) return;

  const currentState: JobState = {
    status: current.status,
    progress: current.progress,
    stage: current.stage,
    resultUrl: current.result_url,
    resultSummary: current.result_summary,
    error: current.error,
  };

  const nextState = calculateNextJobState(currentState, event, config.PUBLIC_RESULTS_BASE_URL);

  await pool.query(
    `UPDATE jobs
     SET status = $2, progress = $3, stage = $4,
         result_url = $5,
         result_summary = $6,
         error = $7,
         updated_at = NOW()
     WHERE id = $1 AND status NOT IN ('COMPLETED', 'FAILED')`,
    [
      event.jobId,
      nextState.status,
      nextState.progress,
      nextState.stage,
      nextState.resultUrl,
      nextState.resultSummary ? JSON.stringify(nextState.resultSummary) : null,
      nextState.error ? JSON.stringify(nextState.error) : null,
    ],
  );
}

export async function checkAndCleanBatchWhitelist(batchId: string): Promise<void> {
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM jobs
     WHERE batch_id = $1 AND status NOT IN ('COMPLETED', 'FAILED')`,
    [batchId],
  );
  const remainingNonTerminal = Number(countResult.rows[0]?.count ?? 0);
  if (remainingNonTerminal > 0) {
    return;
  }

  const batchResult = await pool.query<BatchRow>(
    "SELECT * FROM batches WHERE id = $1",
    [batchId],
  );
  const batch = batchResult.rows[0];
  if (!batch || batch.whitelist_deleted_at !== null) {
    return;
  }

  try {
    await storage.deletePrefix(UPLOADS_BUCKET, `${batchId}/whitelist/`);
  } catch (error) {
    console.error(`Failed to delete S3 whitelist objects for batch ${batchId}`, error);
  }

  try {
    await pool.query(
      `UPDATE batches SET whitelist_deleted_at = NOW()
       WHERE id = $1 AND whitelist_deleted_at IS NULL`,
      [batchId],
    );
  } catch (error) {
    console.error(`Failed to update whitelist_deleted_at for batch ${batchId}`, error);
  }
}

export async function cleanupExpiredBatches(): Promise<number> {
  const result = await pool.query(
    "DELETE FROM batches WHERE created_at < NOW() - INTERVAL '24 hours'",
  );
  return result.rowCount ?? 0;
}

export async function getStats(): Promise<Record<string, number>> {
  const result = await pool.query<QueryResultRow>(
    "SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status",
  );
  return Object.fromEntries(result.rows.map((row) => [row.status, row.count]));
}
