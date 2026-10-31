/**
 * Batch creation lifecycle hook coordinating draft creation, chunked uploads, and execution kickoff.
 *
 * What it polls: Does not poll recurring intervals; monitors active upload progress and worker dispatches.
 * When it stops: Upload flows run to completion or abort on unhandled exceptions; `busy` state resets in `finally`.
 * How errors surface: Exceptions thrown by `uploadBatch` or `startBatch` are caught, assigned to `error` for
 * presentation in form alert banners, and re-thrown to let callers adjust form recovery states.
 */
import { useState } from "react";
import { startBatch, uploadBatch, UploadProgress } from "../api";
import { Batch } from "../types";

/**
 * Coordinates multi-step batch creation, chunked file upload workers, and execution start.
 *
 * @returns State object exposing busy state, error messages, and create/start dispatch methods
 */
export function useCreateBatch() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async (
    files: File[],
    whitelist: File[],
    config: Record<string, unknown>,
    onProgress?: (progress: UploadProgress) => void,
    existingBatchId?: string,
    name?: string,
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await uploadBatch(files, whitelist, config, onProgress, existingBatchId, name);
      return result;
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "Upload failed";
      setError(text);
      throw reason;
    } finally {
      setBusy(false);
    }
  };

  const startWithoutThem = async (batchId: string): Promise<Batch> => {
    setBusy(true);
    setError("");
    try {
      const started = await startBatch(batchId);
      return started.batch;
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "Start failed";
      setError(text);
      throw reason;
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    setError,
    create,
    startWithoutThem,
  };
}
