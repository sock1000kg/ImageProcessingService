/**
 * Short-lived signed URLs for a job's result, its original upload and a batch's reference photos.
 */
import path from "node:path";
import { config } from "../config";
import { getBatchOwnedByUser, getJobOwnedByUser } from "../repositories/job.repository";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../storage";
import { buildAttachmentContentDisposition } from "../attachment";
import { JobStatus } from "../generated/prisma/client";
import { UUID_REGEX } from "../dto";
import { notFound } from "../errors";

/**
 * Computes the download filename for a job result using the original filename's stem
 * and the output format extension.
 *
 * Why stem + output extension: The processed result may be converted to another format (e.g. .jpg or .webp),
 * while preserving the user's original file stem for recognition.
 */
export function buildJobResultFilename(originalFilename: string, outputKey: string): string {
  let base = path.basename(originalFilename);
  base = base
    .replace(/[/\\]+/g, "")
    .replace(/\.\.+/g, "")
    .trim();
  if (!base) base = "image";

  const parsed = path.parse(base);
  let stem = parsed.name || "image";
  const knownExts = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff"];
  for (const ext of knownExts) {
    if (stem.toLowerCase().endsWith(ext)) {
      stem = stem.slice(0, -ext.length) || "image";
      break;
    }
  }

  const extFromOutput = path.extname(outputKey);
  const resultExt = (extFromOutput || parsed.ext || ".jpg").toLowerCase();
  return `${stem}${resultExt}`;
}

/**
 * Generates a presigned GET URL for a completed job's result image.
 *
 * Why owner verification: Job results may contain sensitive personally identifiable imagery.
 * Only the owner may obtain presigned access; unauthenticated or cross-tenant requests receive 404.
 * Why 404 on uncompleted: Jobs pending or processing have no finished artifact in the results bucket.
 * Why signed response-content-disposition: When download is requested, signing the attachment header
 * ensures the browser saves the file with its original name and output extension even across domains.
 */
export async function getJobResultPresignedUrl(
  id: string,
  userId: string,
  options?: { download?: boolean },
): Promise<{ url: string; expiresAt: string }> {
  const job = await getJobOwnedByUser(id, userId);
  if (!job) {
    throw notFound("Job not found");
  }

  if (job.status !== JobStatus.COMPLETED || !job.outputKey) {
    throw notFound("Job result not found");
  }

  let contentDisposition: string | undefined = undefined;
  if (options?.download) {
    const filename = buildJobResultFilename(job.originalFilename, job.outputKey);
    contentDisposition = buildAttachmentContentDisposition(filename);
  }

  return storage.presignGetUrl(RESULTS_BUCKET, job.outputKey, {
    ttlSeconds: config.PRESIGN_RESULT_TTL_SECONDS,
    contentDisposition,
  });
}

/**
 * Generates a presigned GET URL for a job's original uploaded image.
 *
 * Why owner verification: Original images are unredacted and must remain strictly private to the owner.
 * Cross-tenant or nonexistent requests return 404.
 * Why private, no-store: Instructs intermediate proxies and browsers never to cache unredacted photos.
 */
export async function getJobOriginalPresignedUrl(
  id: string,
  userId: string,
): Promise<{ url: string; expiresAt: string }> {
  const job = await getJobOwnedByUser(id, userId);
  if (!job) {
    throw notFound("Job not found");
  }

  return storage.presignGetUrl(UPLOADS_BUCKET, job.inputKey, {
    ttlSeconds: config.PRESIGN_PRIVATE_TTL_SECONDS,
    cacheControl: "private, no-store",
  });
}

/**
 * Generates a presigned GET URL for the batch's nth reference whitelist photo (1-based index).
 *
 * Why owner verification: Whitelist reference images contain biometric profile data that must remain
 * strictly private to the user account that uploaded or referenced them.
 * Why key index lookup: Reuses batch.whitelistKeys without constructing storage keys from user input.
 * Why private, no-store: Protects biometric photos from caching by browsers or intermediate proxies.
 */
export async function getBatchWhitelistPresignedUrl(
  batchId: string,
  index: number,
  userId: string,
): Promise<{ url: string; expiresAt: string }> {
  if (!UUID_REGEX.test(batchId)) {
    throw notFound("Batch not found");
  }

  const batch = await getBatchOwnedByUser(batchId, userId);
  if (!batch) {
    throw notFound("Batch not found");
  }

  const keys = Array.isArray(batch.whitelistKeys) ? batch.whitelistKeys : [];
  if (index < 1 || index > keys.length) {
    throw notFound("Allow list photo not found");
  }

  const key = keys[index - 1]!;
  return storage.presignGetUrl(UPLOADS_BUCKET, key, {
    ttlSeconds: config.PRESIGN_PRIVATE_TTL_SECONDS,
    cacheControl: "private, no-store",
  });
}
