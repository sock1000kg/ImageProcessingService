/**
 * Active batch management hook responsible for fetching, continuous polling, and deletion.
 *
 * What it polls: Calls `getBatch(batchId)` to fetch updated batch jobs, progress, and stage details.
 * Polling cadence: Performs an immediate fetch upon receiving a valid `batchId`, then polls every 3 seconds.
 * When it stops: Polling cancels whenever `batchId` changes or the component unmounts. Polling also ceases
 * when the batch is deleted.
 * How errors surface: Initial fetch failures populate `error`, while subsequent background polling or
 * deletion failures are forwarded to `onMessage` without unmounting the active batch view.
 */
import { useCallback, useEffect, useState } from "react";
import { deleteBatch, getBatch } from "../api";
import { Batch } from "../types";

/**
 * Manages active batch state, automated 3-second polling, and batch deletion.
 *
 * @param batchId Unique identifier of the batch to monitor, or undefined when inactive
 * @param onMessage Optional callback to receive error notifications on polling or deletion failures
 * @returns State object containing the active batch, loading indicator, errors, and refresh/delete handlers
 */
export function useBatch(batchId: string | undefined, onMessage?: (message: string) => void) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBatch = useCallback(async () => {
    if (!batchId) return;
    try {
      const response = await getBatch(batchId);
      setBatch(response.batch);
      setError(null);
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "Unable to refresh batch";
      onMessage?.(text);
    }
  }, [batchId, onMessage]);

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

    const timer = window.setInterval(() => {
      void refreshBatch();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [batchId, refreshBatch]);

  const removeBatch = useCallback(async (): Promise<boolean> => {
    if (!batch) return false;
    try {
      await deleteBatch(batch.id);
      setBatch(null);
      return true;
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "Delete failed";
      onMessage?.(text);
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
