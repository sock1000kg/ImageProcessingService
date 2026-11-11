/**
 * Applies worker events (progress, completion, failure) from NATS to the job and batch records.
 */
import { clearJobReplacesJobId, deleteJob, getBatch, getJob, updateJobState } from "../repositories/job.repository";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../storage";
import { JobStatus } from "../generated/prisma/client";
import { calculateNextJobState, JobState } from "../domain";
import { ValidatedJobEvent } from "../dto";

/**
 * Rewrites a worker WHITELIST_REFERENCE_ERROR message to display the reference photo's original filename
 * instead of internal bucket storage keys. Falls back to a generic description if the key is unknown.
 *
 * Why storage keys are stripped: Internal storage paths (e.g. `uploads/lists/...`) expose system bucket
 * structures and UUIDs to end users. Replacing them with the user's uploaded filename keeps error notices
 * actionable while preserving privacy and security boundaries.
 */
export function sanitizeWhitelistReferenceErrorMessage(
  message: string,
  whitelistKeys: string[],
  whitelistNames: Record<string, unknown>,
): string {
  // Find which whitelist key is contained in the worker's error message.
  // The worker prefixes the key with the bucket name (e.g. `uploads/lists/...` or `uploads/<batchId>/whitelist/...`),
  // while `whitelistKeys` contains `lists/...` or `<batchId>/whitelist/...`.
  const matchedKey = [...whitelistKeys].sort((a, b) => b.length - a.length).find((key) => key && message.includes(key));

  let replacement = "a reference photo";
  if (matchedKey) {
    const rawName = whitelistNames[matchedKey];
    if (typeof rawName === "string" && rawName.trim().length > 0) {
      replacement = rawName.trim();
    }
  }

  // Replace the whole quoted identifier (e.g. `'uploads/lists/...'` or `"uploads/..."`)
  const quotedMatch = message.match(/['"]([^'"]+)['"]/);
  if (quotedMatch) {
    return message.replace(quotedMatch[0], replacement);
  }

  // Fallback: replace any unquoted key occurrence or remaining bucket prefix
  if (matchedKey) {
    const keyPattern = new RegExp(`(?:uploads/)?${matchedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    return message.replace(keyPattern, replacement);
  }

  return message.replace(/uploads\/[^\s,':]+/g, replacement);
}

export async function applyJobEvent(event: ValidatedJobEvent): Promise<void> {
  const current = await getJob(event.jobId);
  if (!current) return;

  const currentState: JobState = {
    status: current.status,
    progress: current.progress,
    stage: current.stage,
    resultSummary: current.resultSummary as Record<string, unknown> | null,
    error: current.error as { code: string; message: string } | null,
  };

  let eventPayload = event;
  if (event.status === "FAILED" && event.error?.code === "WHITELIST_REFERENCE_ERROR" && event.error.message) {
    // Why batch lookup only on WHITELIST_REFERENCE_ERROR: Normal processing events avoid
    // an extra database round trip; only bad reference failures load the batch to resolve filenames.
    const batch = await getBatch(current.batchId);
    const keys = Array.isArray(batch?.whitelistKeys) ? batch.whitelistKeys : [];
    const names =
      batch &&
      typeof batch.whitelistNames === "object" &&
      batch.whitelistNames !== null &&
      !Array.isArray(batch.whitelistNames)
        ? (batch.whitelistNames as Record<string, unknown>)
        : {};
    const sanitizedMessage = sanitizeWhitelistReferenceErrorMessage(event.error.message, keys, names);
    eventPayload = {
      ...eventPayload,
      error: {
        ...event.error,
        message: sanitizedMessage,
      },
    };
  }

  if (
    current.whitelistRefs &&
    current.whitelistRefs.length > 0 &&
    event.status === "COMPLETED" &&
    event.resultSummary?.detections
  ) {
    eventPayload = {
      ...event,
      resultSummary: {
        ...event.resultSummary,
        detections: event.resultSummary.detections.map((detection) => {
          if (
            typeof detection.whitelistRef === "number" &&
            current.whitelistRefs[detection.whitelistRef] !== undefined
          ) {
            return {
              ...detection,
              whitelistRef: current.whitelistRefs[detection.whitelistRef],
            };
          }
          return detection;
        }),
      },
    };
  }

  const nextState = calculateNextJobState(currentState, eventPayload);

  let finalSummary = nextState.resultSummary;
  // Why merge on replacesJobId: An image-render worker reports filter stats without detections.
  // Merging over stored summary ensures detections survive into the completed row.
  if (current.replacesJobId && current.resultSummary) {
    const stored = current.resultSummary as Record<string, unknown>;
    const incoming = (event.resultSummary as Record<string, unknown> | undefined) ?? {};
    finalSummary = {
      ...stored,
      ...incoming,
      detections: incoming.detections ?? stored.detections,
    };
  }

  let resultBytes: number | null | undefined = undefined;
  if (nextState.status === JobStatus.COMPLETED) {
    resultBytes = await storage.statObject(RESULTS_BUCKET, current.outputKey);
  }

  await updateJobState(event.jobId, {
    status: nextState.status,
    progress: nextState.progress,
    stage: nextState.stage,
    resultSummary: finalSummary,
    error: nextState.error,
    resultBytes,
  });

  // On COMPLETED: delete old row's result, input and DB row, then set replacesJobId to null.
  // Done after saving new row as COMPLETED so we never risk losing both results.
  if (nextState.status === JobStatus.COMPLETED && current.replacesJobId) {
    const oldJob = await getJob(current.replacesJobId);
    if (oldJob) {
      try {
        await storage.deleteObject(RESULTS_BUCKET, oldJob.outputKey);
      } catch (err) {
        console.error(`Failed to delete old result object ${oldJob.outputKey}`, err);
      }
      try {
        await storage.deleteObject(UPLOADS_BUCKET, oldJob.inputKey);
      } catch (err) {
        console.error(`Failed to delete old input object ${oldJob.inputKey}`, err);
      }
      await deleteJob(oldJob.id);
    }
    await clearJobReplacesJobId(current.id);
  }
}
