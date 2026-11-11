import { useEffect, useState } from "react";
import { getLimits } from "../api";
import { getUploadLimits, setUploadLimits, UploadLimits } from "../upload-limits";

/**
 * Returns this deployment's upload limits (null until known) and makes them available to the file checks. The request
 * is made once per page load; if it fails the limits stay unknown and only the backend enforces them.
 */
export function useUploadLimits(): UploadLimits | null {
  const [limits, setLimits] = useState<UploadLimits | null>(getUploadLimits());

  useEffect(() => {
    if (getUploadLimits() !== null) return;
    let active = true;
    void getLimits()
      .then((loaded) => {
        // Ignore anything that is not a usable answer rather than enforcing nonsense limits.
        if (
          !Number.isFinite(loaded?.imageUploadMaxBytes) ||
          !Number.isFinite(loaded?.videoUploadMaxBytes) ||
          !Number.isFinite(loaded?.batchMaxFiles)
        ) {
          return;
        }
        setUploadLimits(loaded);
        if (active) setLimits(loaded);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return limits;
}
