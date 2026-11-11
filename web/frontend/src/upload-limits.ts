/**
 * This deployment's upload limits (bytes per file, files per batch), learned from `GET /api/limits`.
 *
 * Why module state: the file checks in `file-selection.ts` are plain functions called from many places, so the limits
 * are set once after the app loads instead of being passed through every call. Until they are known, nothing is
 * checked in the browser (the backend still rejects what is over the limit).
 */
export type UploadLimits = {
  /** Largest photo, in bytes (photos are sent in a single request). */
  imageUploadMaxBytes: number;
  /** Largest video, in bytes (videos are sent in chunks, so this can be much bigger). */
  videoUploadMaxBytes: number;
  batchMaxFiles: number;
};

let limits: UploadLimits | null = null;

export function setUploadLimits(next: UploadLimits | null): void {
  limits = next;
}

export function getUploadLimits(): UploadLimits | null {
  return limits;
}

/** The size limit that applies to this file (the video limit for MP4, otherwise the photo limit), or null if unknown. */
export function getSizeLimitFor(file: File): number | null {
  if (!limits) return null;
  const isVideo = file.type.startsWith("video/") || file.name.toLowerCase().endsWith(".mp4");
  return isVideo ? limits.videoUploadMaxBytes : limits.imageUploadMaxBytes;
}
