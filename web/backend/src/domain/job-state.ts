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

export function calculateNextJobState(
  current: JobState,
  event: ValidatedJobEvent,
  publicResultsBaseUrl = "/results",
): JobState {
  // Terminal state protection: first terminal event wins
  if (current.status === "COMPLETED" || current.status === "FAILED") {
    return current;
  }

  // Progress never decreases, clamped to [0, 100] and rounded to integer
  const rawProgress =
    event.progress !== undefined
      ? Math.round(event.progress)
      : current.progress;
  const clampedProgress = Math.max(
    0,
    Math.min(100, Number.isNaN(rawProgress) ? current.progress : rawProgress),
  );
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
    const resultUrl = event.result
      ? `${publicResultsBaseUrl}/${event.result.key}`
      : current.resultUrl;
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
