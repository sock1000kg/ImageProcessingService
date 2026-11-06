/**
 * Polling intervals for workspace live synchronization.
 *
 * - `BATCH_SYNC_MS`: Cadence at which the batch page re-fetches the active batch and its jobs.
 * - `STATS_SYNC_MS`: Cadence at which the overview dashboard re-fetches aggregate job stats.
 */
export const BATCH_SYNC_MS = 3000;
export const STATS_SYNC_MS = 5000;
