/**
 * Aggregate status calculator determining overall batch status from individual job states.
 */
import { BatchStatus, JobStatus } from "../types";

/**
 * Derives collective batch status (DRAFT, PROCESSING, COMPLETED, or PARTIAL).
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

  const hasFailed = jobStatuses.some((status) => status === "FAILED");
  if (hasFailed) {
    return "PARTIAL";
  }

  return "COMPLETED";
}
