/**
 * Data retention: delete reference photos when a batch ends and clean up batches past their retention.
 */
import {
  deleteBatchRow,
  getBatch,
  getBatchesPendingWhitelistCleanup,
  getExpiredBatches,
  getJobsByBatchId,
  markBatchWhitelistDeleted,
} from "../repositories/job.repository";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../storage";
import { JobStatus } from "../generated/prisma/client";

/**
 * Evaluates terminal status across all jobs in a batch to trigger biometric reference cleanup.
 *
 * Why whitelist cleanup timing: To uphold privacy commitments and prevent lingering biometric data,
 * reference whitelist faces stored in the uploads bucket are purged from S3 immediately after all
 * jobs reach terminal state (COMPLETED or FAILED). Setting whitelistDeletedAt records that the S3 delete succeeded.
 */
export async function checkAndCleanBatchWhitelist(batchId: string): Promise<void> {
  const batch = await getBatch(batchId);
  if (!batch || batch.startedAt === null || batch.whitelistDeletedAt !== null) {
    return;
  }

  const jobs = await getJobsByBatchId(batchId);
  if (jobs.length === 0) {
    return;
  }

  // Whitelist files remain in S3 while any image job is still processing or queued
  const remainingNonTerminal = jobs.some(
    (job) => job.status !== JobStatus.COMPLETED && job.status !== JobStatus.FAILED,
  );
  if (remainingNonTerminal) {
    return;
  }

  try {
    await storage.deletePrefix(UPLOADS_BUCKET, `${batchId}/whitelist/`);
  } catch (error) {
    console.error(`Failed to delete S3 whitelist objects for batch ${batchId}`, error);
    return;
  }

  try {
    await markBatchWhitelistDeleted(batchId);
  } catch (error) {
    console.error(`Failed to update whitelistDeletedAt for batch ${batchId}`, error);
  }
}

/**
 * Retries whitelist cleanup for finished batches whose storage delete failed or was interrupted.
 *
 * Why periodic retry: A finished batch gets no more job events, so if the initial storage deletion
 * fails upon terminal transition, the batch's biometric reference photos would linger in storage
 * indefinitely unless retried by a background timer.
 */
export async function retryPendingWhitelistCleanups(): Promise<void> {
  const batches = await getBatchesPendingWhitelistCleanup();
  for (const batch of batches) {
    try {
      await checkAndCleanBatchWhitelist(batch.id);
    } catch (error) {
      console.error(`Failed to retry whitelist cleanup for batch ${batch.id}`, error);
    }
  }
}

export async function cleanupExpiredBatches(): Promise<number> {
  const expiredBatches = await getExpiredBatches();
  let deleted = 0;

  for (const batch of expiredBatches) {
    let storageDeleted = true;
    for (const bucket of [UPLOADS_BUCKET, RESULTS_BUCKET]) {
      try {
        await storage.deletePrefix(bucket, `${batch.id}/`);
      } catch (error) {
        storageDeleted = false;
        console.error(`Failed to clean expired objects for batch ${batch.id} in ${bucket}`, error);
      }
    }

    // Keep the batch row when storage deletion fails so future cleanup runs can retry removing any remaining files (including private originals).
    if (!storageDeleted) {
      continue;
    }

    try {
      if (await deleteBatchRow(batch.id)) {
        deleted++;
      }
    } catch (error) {
      console.error(`Failed to delete expired batch row ${batch.id}`, error);
    }
  }

  return deleted;
}
