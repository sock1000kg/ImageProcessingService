/**
 * Object URL for a job's original image, fetched with the user's access token.
 */
import { useEffect, useState } from "react";
import { fetchJobOriginal } from "../api";

/**
 * Returns a blob: URL for the original image of `jobId`, or null while loading or on error.
 * The URL is revoked when the job changes or the component unmounts, so the image bytes are freed.
 */
export function useJobOriginalUrl(jobId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setUrl(null);
    fetchJobOriginal(jobId, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        // Aborted or not found: the viewer just shows no original.
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [jobId]);

  return url;
}
