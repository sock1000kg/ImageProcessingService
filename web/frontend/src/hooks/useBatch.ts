/**
 * Active batch management hook responsible for fetching, continuous polling, and deletion.
 *
 * What it polls: Calls `getBatch(batchId)` to fetch updated batch jobs, progress, and stage details.
 * Polling cadence: Performs an immediate fetch upon receiving a valid `batchId`, then polls every 3 seconds via `usePolling`.
 * When it stops: Polling cancels whenever `batchId` changes or the component unmounts via `usePolling`. Polling also ceases
 * when the batch is deleted.
 * How errors surface: Initial fetch failures populate `error`. Subsequent polling errors update the connection status
 * overlay without alerts, while 404s show "Batch not found". Deletion failures are forwarded to `onMessage`.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError, deleteBatch, getBatch } from "../api";
import { BATCH_SYNC_MS } from "../sync";
import { Batch, MessageHandler } from "../types";
import { usePolling } from "./usePolling";

/**
 * Manages active batch state, automated 3-second polling, and batch deletion.
 *
 * @param batchId Unique identifier of the batch to monitor, or undefined when inactive
 * @param onMessage Optional callback to receive error notifications on deletion failures
 * @returns State object containing the active batch, loading indicator, errors, and refresh/delete handlers
 */
export function useBatch(batchId: string | undefined, onMessage?: MessageHandler) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const pollBatch = useCallback(async () => {
    if (!batchId) return;
    try {
      const response = await getBatch(batchId);
      setBatch(response.batch);
      setError(null);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        setError(reason.message || "Batch not found");
        setBatch(null);
      }
      throw reason;
    }
  }, [batchId]);

  usePolling(batchId ? pollBatch : null, BATCH_SYNC_MS);

  const refreshBatch = useCallback(async () => {
    try {
      await pollBatch();
    } catch {
      // Non-blocking manual refresh: swallow errors so non-poll callers (like onRefresh) never throw
    }
  }, [pollBatch]);

  useEffect(() => {
    // Immediately clear previous batch data when batchId changes so outdated details are not shown
    setBatch(null);

    if (!batchId) {
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    void getBatch(batchId)
      .then((res) => {
        setBatch(res.batch);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Batch not found");
        setBatch(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [batchId]);

  const removeBatch = useCallback(async (): Promise<boolean> => {
    if (!batch) return false;
    try {
      await deleteBatch(batch.id);
      setBatch(null);
      return true;
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "Delete failed";
      onMessage?.(text, { variant: "error" });
      return false;
    }
  }, [batch, onMessage]);

  return {
    batch,
    loading,
    error,
    refreshBatch,
    removeBatch,
  };
}
