/**
 * Multipart upload of a video (S3 "multipart upload"): start a session, send the file in parts, then complete (or
 * cancel) it. Not to be confused with `multipart/form-data`, the encoding the single-request photo route uses.
 *
 * The flow, and where each step runs:
 *   1. beginMultipartUpload      checks the request, opens an S3 multipart upload and saves an UploadSession row.
 *   2. writeMultipartPart  stores one chunk (called once per chunk, in any order).
 *   3. finishMultipartUpload     assembles the chunks, checks the result, and creates the job; any failure cleans up.
 *   4. cancelMultipartUpload     the client gives up: abort the multipart upload and drop the session.
 *
 * Why a session row: the browser only carries the short session id. The row holds the S3 upload id, the object key
 * and the size the client declared, and ties the upload to its owner so nobody can add parts to another user's upload.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { config, uploadLimitLabel } from "../config";
import { badRequest, notFound, payloadTooLarge } from "../errors";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  statObject,
  uploadPart,
  UPLOADS_BUCKET,
} from "../storage";
import { addBatchStoredObject } from "./batch.service";
import { getBatchOwnedByUser } from "../repositories/job.repository";
import { validateUploadedVideo } from "./video-validation.service";
import { discardUpload } from "./upload-cleanup.service";

const VIDEO_EXT = ".mp4";

function isVideo(filename: string): boolean {
  return path.extname(filename).toLowerCase() === VIDEO_EXT;
}

/** Loads a session only if it belongs to this user; anything else looks like "not found". */
async function findOwnedSession(userId: string, sessionId: string) {
  const session = await prisma.uploadSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw notFound("Upload session not found");

  return session;
}

export async function beginMultipartUpload(
  userId: string,
  batchId: string,
  filename: string,
  contentType: string,
  totalBytes: number,
) {
  // What the client declares must be sane and allowed before anything is created in storage.
  if (!filename || !Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
    throw badRequest("Invalid upload metadata");
  }

  if (totalBytes > config.VIDEO_UPLOAD_MAX_BYTES) {
    throw payloadTooLarge(
      `Video exceeds the file size limit of ${uploadLimitLabel(config.VIDEO_UPLOAD_MAX_BYTES)}`,
      "FILE_TOO_LARGE",
    );
  }

  // Images are small and go through the single-request route; only MP4 videos use multipart.
  if (!isVideo(filename)) {
    throw badRequest("Multipart upload is currently reserved for MP4 video files", "INVALID_MEDIA_TYPE");
  }

  if (contentType !== "video/mp4") {
    throw badRequest("Video must use MIME type video/mp4", "INVALID_MEDIA_TYPE");
  }

  // The batch must be the caller's own.
  const batch = await getBatchOwnedByUser(batchId, userId);
  if (!batch) throw notFound("Batch not found");

  // The same key layout as every other input: <batchId>/<unique id>/input.mp4.
  const objectKey = `${batchId}/${randomUUID()}/input.mp4`;
  const uploadId = await createMultipartUpload(UPLOADS_BUCKET, objectKey, contentType);

  return prisma.uploadSession.create({
    data: { id: randomUUID(), userId, batchId, objectKey, filename, contentType, totalBytes, uploadId },
  });
}

/** Stores one chunk and returns its ETag, which the client sends back at completion. */
export async function writeMultipartPart(
  userId: string,
  sessionId: string,
  partNumber: number,
  body: Buffer,
): Promise<string> {
  const session = await findOwnedSession(userId, sessionId);

  // The declared size fixes how many parts there can be, so a client cannot keep sending parts past what it declared
  // (and past the size limit that was checked at the start). The limit and chunk size are validated at startup so this
  // never exceeds S3's 10,000 part ceiling.
  const maxPartNumber = Math.ceil(session.totalBytes / config.UPLOAD_CHUNK_BYTES);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > maxPartNumber) {
    throw badRequest("Invalid part number");
  }

  if (body.length === 0 || body.length > config.UPLOAD_CHUNK_BYTES) {
    throw badRequest("Invalid chunk size", "INVALID_CHUNK");
  }

  const etag = await uploadPart(UPLOADS_BUCKET, session.objectKey, session.uploadId, partNumber, body);

  // Every stored part proves the upload is alive, so the abandoned-upload cleanup measures idle time, not age.
  await prisma.uploadSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } });

  return etag;
}

/**
 * Assembles the uploaded parts into the video, checks it, and creates the job for it.
 * If anything fails after assembly starts, the half-finished upload is discarded and the error is rethrown.
 */
export async function finishMultipartUpload(
  userId: string,
  sessionId: string,
  parts: Array<{ partNumber: number; etag: string }>,
) {
  const session = await findOwnedSession(userId, sessionId);

  assertUsableParts(parts);

  let job;
  try {
    // Ask storage to join the parts into one object.
    await completeMultipartUpload(UPLOADS_BUCKET, session.objectKey, session.uploadId, parts);

    // The size came from the client, so compare it with what storage actually assembled.
    const actualBytes = await statObject(UPLOADS_BUCKET, session.objectKey);
    if (actualBytes !== session.totalBytes) {
      throw badRequest("Uploaded size does not match declared size", "UPLOAD_SIZE_MISMATCH");
    }

    // Codec, duration and readability (see video-validation.service.ts).
    await validateUploadedVideo(session.objectKey);

    job = await addBatchStoredObject(
      session.batchId,
      {
        originalFilename: session.filename,
        inputKey: session.objectKey,
        inputBytes: actualBytes,
        contentType: session.contentType,
      },
      userId,
    );
  } catch (error) {
    await discardUpload(session);
    throw error;
  }

  // The job exists now and owns the object, so a failure to drop the session row is only logged, never cleaned up
  // by deleting the video.
  await prisma.uploadSession.delete({ where: { id: session.id } }).catch((deleteError) => {
    console.error(`Failed to delete upload session ${session.id}`, deleteError);
  });

  return job;
}

/** The parts the client lists must be 1..N with no gaps or repeats, each with its ETag. */
function assertUsableParts(parts: Array<{ partNumber: number; etag: string }>): void {
  if (parts.length === 0 || parts.some((part) => !Number.isInteger(part.partNumber) || !part.etag)) {
    throw badRequest("At least one valid uploaded part is required");
  }

  const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const isConsecutive = sortedParts.every((part, index) => part.partNumber === index + 1);

  if (!isConsecutive) {
    throw badRequest("Uploaded parts must be consecutive and unique", "INVALID_UPLOAD_PARTS");
  }
}

/** The client gave up before completing: abort the multipart upload so no stored parts are left, then drop the row. */
export async function cancelMultipartUpload(userId: string, sessionId: string): Promise<void> {
  const session = await findOwnedSession(userId, sessionId);

  await abortMultipartUpload(UPLOADS_BUCKET, session.objectKey, session.uploadId);
  await prisma.uploadSession.delete({ where: { id: session.id } });
}
