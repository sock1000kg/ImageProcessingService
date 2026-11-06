/**
 * Hook providing an authenticated object URL, loading state, and error status for private images.
 *
 * Why centralized lifecycle: Handles AbortController cancellation on parameter changes or unmount
 * and ensures previous object URLs are cleanly revoked to avoid leaking memory for sensitive media.
 */
import { useEffect, useState } from "react";
import { fetchPrivateImage } from "../api";

export interface PrivateImageState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

/**
 * Returns `{ url, loading, error }` for an authenticated image path.
 * Accepts an optional `revision` counter to re-fetch when the resource is updated.
 */
export function usePrivateImage(path?: string | null, revision = 0): PrivateImageState {
  const [state, setState] = useState<PrivateImageState>({
    url: null,
    loading: Boolean(path),
    error: false,
  });

  useEffect(() => {
    if (!path) {
      setState({ url: null, loading: false, error: false });
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setState({ url: null, loading: true, error: false });

    fetchPrivateImage(path, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ url: null, loading: false, error: true });
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path, revision]);

  return state;
}
