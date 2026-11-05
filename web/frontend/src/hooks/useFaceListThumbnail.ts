/**
 * Object URL for a saved face list thumbnail image, fetched with authentication.
 */
import { useEffect, useState } from "react";
import { fetchFaceListThumbnail } from "../api";

/**
 * Returns an object URL for a face reference at `index` (1-based) within `listId`.
 * Revokes the URL on unmount or when the parameters change.
 */
export function useFaceListThumbnail(listId: string, index: number): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setUrl(null);

    fetchFaceListThumbnail(listId, index, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        // Ignored on abort or failure
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [listId, index]);

  return url;
}
