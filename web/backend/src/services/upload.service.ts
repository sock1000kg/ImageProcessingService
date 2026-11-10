import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { config } from "../config";
import { badRequest, notFound, payloadTooLarge } from "../errors";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  statObject,
  uploadPart,
  storage,
  UPLOADS_BUCKET,
} from "../storage";
import { addBatchStoredObject } from "./batch.service";
import { getBatchOwnedByUser } from "../repositories/job.repository";
import { validateUploadedVideo } from "./video-validation.service";

export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const MIN_S3_PART_BYTES = 5 * 1024 * 1024;
const VIDEO_EXT = ".mp4";

function isVideo(filename: string): boolean {
  return path.extname(filename).toLowerCase() === VIDEO_EXT;
}

export async function beginUpload(
  userId: string,
  batchId: string,
  filename: string,
  contentType: string,
  totalBytes: number,
) {
  if (!filename || !Number.isSafeInteger(totalBytes) || totalBytes <= 0) throw badRequest("Invalid upload metadata");
  if (totalBytes > config.UPLOAD_MAX_BYTES)
    throw payloadTooLarge(`File exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`, "FILE_TOO_LARGE");
  if (!isVideo(filename))
    throw badRequest("Multipart upload is currently reserved for MP4 video files", "INVALID_MEDIA_TYPE");
  if (contentType !== "video/mp4") throw badRequest("Video must use MIME type video/mp4", "INVALID_MEDIA_TYPE");
  const batch = await getBatchOwnedByUser(batchId, userId);
  if (!batch) throw notFound("Batch not found");
  const key = `${batchId}/${randomUUID()}/input.mp4`;
  const uploadId = await createMultipartUpload(UPLOADS_BUCKET, key, contentType);
  return prisma.uploadSession.create({
    data: { id: randomUUID(), userId, batchId, objectKey: key, filename, contentType, totalBytes, uploadId },
  });
}

export async function writeUploadPart(
  userId: string,
  sessionId: string,
  partNumber: number,
  body: Buffer,
): Promise<string> {
  const session = await prisma.uploadSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw notFound("Upload session not found");
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw badRequest("Invalid part number");
  if (body.length === 0 || body.length > UPLOAD_CHUNK_BYTES) throw badRequest("Invalid chunk size", "INVALID_CHUNK");
  return uploadPart(UPLOADS_BUCKET, session.objectKey, session.uploadId, partNumber, body);
}

export async function finishUpload(
  userId: string,
  sessionId: string,
  parts: Array<{ partNumber: number; etag: string }>,
) {
  const session = await prisma.uploadSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw notFound("Upload session not found");
  if (parts.length === 0 || parts.some((part) => !Number.isInteger(part.partNumber) || !part.etag)) {
    throw badRequest("At least one valid uploaded part is required");
  }
  const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  if (
    sortedParts.some((part, index) => part.partNumber !== index + 1) ||
    new Set(sortedParts.map((part) => part.partNumber)).size !== sortedParts.length
  ) {
    throw badRequest("Uploaded parts must be consecutive and unique", "INVALID_UPLOAD_PARTS");
  }
  // Any failure below (assembly, size check, ffprobe validation, job creation) leaves a half-finished object, so
  // the catch discards the multipart upload, the stored object and the session before rethrowing.
  try {
    await completeMultipartUpload(UPLOADS_BUCKET, session.objectKey, session.uploadId, parts);
    // The declared size came from the client, so compare it with what storage actually assembled.
    const actualBytes = await statObject(UPLOADS_BUCKET, session.objectKey);
    if (actualBytes !== session.totalBytes) {
      await storage.deleteObject(UPLOADS_BUCKET, session.objectKey);
      throw badRequest("Uploaded size does not match declared size", "UPLOAD_SIZE_MISMATCH");
    }
    await validateUploadedVideo(session.objectKey);
    const job = await addBatchStoredObject(
      session.batchId,
      {
        originalFilename: session.filename,
        inputKey: session.objectKey,
        inputBytes: actualBytes,
        contentType: session.contentType,
      },
      userId,
    );
    await prisma.uploadSession.delete({ where: { id: session.id } });
    return job;
  } catch (error) {
    try {
      await abortMultipartUpload(UPLOADS_BUCKET, session.objectKey, session.uploadId);
    } catch (abortError) {
      console.error(`Failed to abort multipart upload ${session.id}`, abortError);
    }
    try {
      await storage.deleteObject(UPLOADS_BUCKET, session.objectKey);
    } catch (deleteError) {
      console.error(`Failed to cleanup multipart object ${session.id}`, deleteError);
    }
    await prisma.uploadSession.delete({ where: { id: session.id } }).catch((deleteError) => {
      console.error(`Failed to cleanup upload session ${session.id}`, deleteError);
    });
    throw error;
  }
}

export async function cancelUpload(userId: string, sessionId: string): Promise<void> {
  const session = await prisma.uploadSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw notFound("Upload session not found");
  await abortMultipartUpload(UPLOADS_BUCKET, session.objectKey, session.uploadId);
  await prisma.uploadSession.delete({ where: { id: session.id } });
}
