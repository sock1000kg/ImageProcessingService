/**
 * Utility functions for formatting byte sizes and readable human strings.
 */

/**
 * Formats a byte size into an appropriate human-readable binary unit (B, KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Resolves a human-readable failure message for a job, replacing internal storage keys
 * with a generic fallback line for older unmigrated records.
 *
 * Why fallback for older jobs: Historical failed jobs persisted before filename sanitization
 * still store raw S3 paths in their error message. Suppressing `uploads/` paths prevents leaking
 * internal bucket details in both the batch alert banner and image result viewer.
 */
export function formatJobErrorMessage(error?: { code?: string; message?: string } | null): string {
  if (!error) return "";
  if (error.code === "WHITELIST_REFERENCE_ERROR") {
    if (!error.message || error.message.includes("uploads/")) {
      return "No face detected in a reference photo.";
    }
    return error.message;
  }
  return error.message ?? "";
}
