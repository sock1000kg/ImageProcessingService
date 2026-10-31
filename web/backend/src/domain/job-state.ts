/**
 * Job state transition domain logic and monotonic progress state machine.
 */
import { JobStatus } from "../types";
import { ValidatedJobEvent } from "../dto/job-event.dto";

export interface JobState {
  status: JobStatus;
  progress: number;
  stage: string | null;
  resultUrl: string | null;
  resultSummary: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
}

/**
 * Calculates the next job state according to strict event sequencing and terminal state rules.
 *
 * @param current Current recorded job state in the database
 * @param event Incoming validated worker event payload from NATS JetStream
 * @param publicResultsBaseUrl Base URL prefix for published output assets
 * @returns Updated job state to persist
 */
export function calculateNextJobState(
  current: JobState,
  event: ValidatedJobEvent,
  publicResultsBaseUrl = "/results",
): JobState {
  // Why terminal states win: Worker events may be delivered out-of-order over NATS JetStream.
  // Once a job enters COMPLETED or FAILED, it is permanently closed. Subsequent lagging heartbeats
  // or late intermediate events must never overwrite terminal status, clear errors, or revert results.
  if (current.status === "COMPLETED" || current.status === "FAILED") {
    return current;
  }

  // Why progress never goes down: Intermediate worker updates can arrive out-of-sequence due to network
  // jitter or concurrent execution. Monotonic progress guarantees that the client's progress percentage
  // strictly increases towards 100% and never regresses backwards.
  const rawProgress = event.progress !== undefined ? Math.round(event.progress) : current.progress;
  const clampedProgress = Math.max(0, Math.min(100, Number.isNaN(rawProgress) ? current.progress : rawProgress));
  const nextProgress = Math.max(current.progress, clampedProgress);

  if (event.status === "PROCESSING") {
    return {
      ...current,
      status: "PROCESSING",
      progress: nextProgress,
      stage: event.stage ?? current.stage,
    };
  }

  if (event.status === "COMPLETED") {
    const resultUrl = event.result ? `${publicResultsBaseUrl}/${event.result.key}` : current.resultUrl;
    return {
      ...current,
      status: "COMPLETED",
      progress: 100,
      stage: event.stage ?? "DONE",
      resultUrl,
      resultSummary: event.resultSummary ?? current.resultSummary,
    };
  }

  if (event.status === "FAILED") {
    return {
      ...current,
      status: "FAILED",
      progress: nextProgress,
      stage: event.stage ?? current.stage,
      error: event.error ?? current.error,
    };
  }

  return current;
}
