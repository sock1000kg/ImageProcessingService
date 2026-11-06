/**
 * Polling intervals and connection synchronization store for workspace telemetry.
 *
 * - `BATCH_SYNC_MS`: Cadence at which the batch page re-fetches the active batch and its jobs.
 * - `STATS_SYNC_MS`: Cadence at which the overview dashboard re-fetches aggregate job stats.
 */
import { useSyncExternalStore } from "react";
import { ApiError } from "./api";

export const BATCH_SYNC_MS = 3000;
export const STATS_SYNC_MS = 5000;

export type SyncStatus = "idle" | "ok" | "lost";

let currentStatus: SyncStatus = "idle";
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SyncStatus {
  return currentStatus;
}

/**
 * Reports a synchronization outcome to update global connection status.
 *
 * Why: Only connection problems count as lost (network drops or server 5xx/429 outages).
 * Other ApiErrors (e.g. 404 Not Found, 401 Unauthorized) mean the backend answered, so they report ok.
 */
export function reportSync(error?: unknown): void {
  let nextStatus: SyncStatus = "ok";

  if (error !== undefined && error !== null) {
    if (error instanceof ApiError) {
      if (error.status >= 500 || error.status === 429) {
        nextStatus = "lost";
      } else {
        nextStatus = "ok";
      }
    } else {
      nextStatus = "lost";
    }
  }

  if (currentStatus !== nextStatus) {
    currentStatus = nextStatus;
    notify();
  }
}

/**
 * Resets synchronization status back to idle when unmounting polling pages.
 *
 * Why: Pages without active polling hooks should never report or maintain a connection state.
 */
export function resetSync(): void {
  if (currentStatus !== "idle") {
    currentStatus = "idle";
    notify();
  }
}

/**
 * Subscribes to the module-level connection sync status using useSyncExternalStore.
 *
 * Why: Avoids wrapping the app in context providers while providing a reactive subscription.
 */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSnapshot);
}
