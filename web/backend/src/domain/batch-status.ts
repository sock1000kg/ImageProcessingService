/**
 * Aggregate status calculator determining overall batch status from individual job states.
 */
import { BatchStatus, JobStatus } from "../types";

/**
 * Derives collective batch status (DRAFT, PROCESSING, COMPLETED, PARTIAL, or FAILED).
 *
 * Status derivation rules:
 * - When startedAt is null, the batch is in DRAFT state.
 * - An empty job set defaults to PROCESSING until jobs are created.
 * - Any non-terminal job (PENDING, QUEUED, PROCESSING) means the batch is still PROCESSING.
 * - When all jobs are terminal:
 *   - If every job has FAILED -> FAILED
 *   - If some jobs have FAILED and some COMPLETED -> PARTIAL
 *   - If all jobs have COMPLETED -> COMPLETED
 */
export function deriveBatchStatus(jobStatuses: JobStatus[], startedAt?: Date | string | null): BatchStatus {
  if (startedAt === null) {
    return "DRAFT";
  }

  if (jobStatuses.length === 0) return "PROCESSING";

  const hasNonTerminal = jobStatuses.some(
    (status) => status === "PENDING" || status === "QUEUED" || status === "PROCESSING",
  );
  if (hasNonTerminal) {
    return "PROCESSING";
  }

  const failedCount = jobStatuses.filter((status) => status === "FAILED").length;
  if (failedCount === jobStatuses.length) {
    return "FAILED";
  }
  if (failedCount > 0) {
    return "PARTIAL";
  }

  return "COMPLETED";
}
