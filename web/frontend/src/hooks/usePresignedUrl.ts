/**
 * Hook providing a short-lived presigned URL, loading state, and error status.
 *
 * Why module-level cache: Deduplicates presigned URL requests across thumbnail components and
 * reuses valid signatures until 30 seconds before expiration without repeated API round-trips.
 */
import { useEffect, useState } from "react";
import { request } from "../api";

export interface PresignedUrlState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

interface CacheEntry {
  url: string;
  expiresAtMs: number;
  revision: number;
  retriedOnError?: boolean;
}

const urlCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<{ url: string; expiresAt: string }>>();

/**
 * Resets the shared in-memory presigned URL cache (used for test isolation).
 */
export function clearPresignedUrlCache(): void {
  urlCache.clear();
  inFlightRequests.clear();
}

/**
 * Returns `{ url, loading, error }` for a presigned URL endpoint path.
 *
 * Why revision argument: Preserves compatibility with existing thumbnail call sites
 * when reference faces are added or deleted, forcing cache invalidation.
 */
export function usePresignedUrl(path?: string | null, revision = 0): PresignedUrlState {
  const getCachedState = (): PresignedUrlState => {
    if (!path) {
      return { url: null, loading: false, error: false };
    }
    const cached = urlCache.get(path);
    // Why 30s threshold: Presigned URLs must not be reused when near expiration to avoid mid-flight 403s.
    if (cached && cached.revision === revision && Date.now() < cached.expiresAtMs - 30_000) {
      return { url: cached.url, loading: false, error: false };
    }
    return { url: null, loading: true, error: false };
  };

  const [state, setState] = useState<PresignedUrlState>(getCachedState);

  useEffect(() => {
    if (!path) {
      setState({ url: null, loading: false, error: false });
      return;
    }

    let isMounted = true;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = (expiresAtMs: number) => {
      if (timerId) clearTimeout(timerId);
      // Why 30s before expiration: Ensures the browser refreshes the signed URL before it expires
      const delay = Math.max(0, expiresAtMs - 30_000 - Date.now());
      timerId = setTimeout(() => {
        if (isMounted) {
          fetchUrl(false);
        }
      }, delay);
    };

    const fetchUrl = async (isRetry = false) => {
      const cached = urlCache.get(path);
      if (!isRetry && cached && cached.revision === revision && Date.now() < cached.expiresAtMs - 30_000) {
        if (isMounted) {
          setState({ url: cached.url, loading: false, error: false });
          scheduleRefresh(cached.expiresAtMs);
        }
        return;
      }

      if (isMounted) {
        setState((prev) => ({ ...prev, loading: true, error: false }));
      }

      try {
        let fetchPromise = inFlightRequests.get(path);
        if (!fetchPromise || isRetry) {
          fetchPromise = request<{ url: string; expiresAt: string }>(path);
          inFlightRequests.set(path, fetchPromise);
        }

        const data = await fetchPromise;
        inFlightRequests.delete(path);

        const expiresAtMs = Date.parse(data.expiresAt);
        const prevEntry = urlCache.get(path);
        const retriedOnError = isRetry ? true : (prevEntry?.retriedOnError ?? false);

        urlCache.set(path, {
          url: data.url,
          expiresAtMs,
          revision,
          retriedOnError,
        });

        if (isMounted) {
          setState({ url: data.url, loading: false, error: false });
          scheduleRefresh(expiresAtMs);
        }
      } catch {
        inFlightRequests.delete(path);
        if (isMounted) {
          setState({ url: null, loading: false, error: true });
        }
      }
    };

    fetchUrl(false);

    // Why capture listener: <img> error events do not bubble, but capture phase on window catches them.
    const handleCaptureError = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target && target.tagName === "IMG") {
        const img = target as HTMLImageElement;
        const currentEntry = urlCache.get(path);
        if (currentEntry && (img.src === currentEntry.url || img.currentSrc === currentEntry.url)) {
          if (!currentEntry.retriedOnError) {
            // Fetch fresh URL once on image load error
            fetchUrl(true);
          } else {
            // Already retried once, mark as error
            if (isMounted) {
              setState({ url: null, loading: false, error: true });
            }
          }
        }
      }
    };

    window.addEventListener("error", handleCaptureError, true);

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      window.removeEventListener("error", handleCaptureError, true);
    };
  }, [path, revision]);

  return state;
}
