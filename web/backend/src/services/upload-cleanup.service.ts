/**
 * Cleanup of video uploads that never finished (the user closed the tab, lost connection, or deleted the batch).
 *
 * An unfinished upload leaves two things behind: an UploadSession row, and the parts already sent, which storage keeps
 * (and bills) until the multipart upload is aborted. Finished uploads remove their own row, so any row that has gone
 * quiet for long enough is an abandoned upload.
 */
import { prisma } from "../db/prisma";
import { abortMultipartUpload, storage, UPLOADS_BUCKET } from "../storage";

/**
 * A session with no part received for this long is treated as abandoned. It is idle time, not age, so a huge upload
 * that takes many hours is never cut off while parts keep arriving.
 */
export const ABANDONED_UPLOAD_IDLE_MS = 6 * 60 * 60 * 1000;

type UploadSession = { id: string; objectKey: string; uploadId: string };

/**
 * Throws away everything a failed upload left behind: the multipart upload, the object if it was assembled, and the
 * session row. Each step is tried even if an earlier one fails, and failures are logged so the original error wins.
 */
export async function discardUpload(session: UploadSession): Promise<void> {
  try {
    await abortMultipartUpload(UPLOADS_BUCKET, session.objectKey, session.uploadId);
  } catch (abortError) {
    console.error(`Failed to abort multipart upload ${session.id}`, abortError);
  }

  try {
    await storage.deleteObject(UPLOADS_BUCKET, session.objectKey);
  } catch (deleteError) {
    console.error(`Failed to delete upload object ${session.id}`, deleteError);
  }

  await prisma.uploadSession.delete({ where: { id: session.id } }).catch((deleteError) => {
    console.error(`Failed to delete upload session ${session.id}`, deleteError);
  });
}

/** Aborts the unfinished uploads of a batch that is being deleted. The rows go with the batch (cascade). */
export async function abortBatchUploads(batchId: string): Promise<void> {
  const sessions = await prisma.uploadSession.findMany({ where: { batchId } });
  for (const session of sessions) {
    try {
      await abortMultipartUpload(UPLOADS_BUCKET, session.objectKey, session.uploadId);
    } catch (error) {
      console.error(`Failed to abort multipart upload ${session.id}`, error);
    }
  }
}

/**
 * Discards sessions past the age limit and returns how many were handled.
 *
 * A row can also be old because the upload finished but its row delete failed. Then a job already owns the video, so
 * only the row is removed; discarding it would delete the video.
 */
export async function cleanupAbandonedUploads(now: number = Date.now()): Promise<number> {
  const stale = await prisma.uploadSession.findMany({
    where: { lastActivityAt: { lt: new Date(now - ABANDONED_UPLOAD_IDLE_MS) } },
  });

  for (const session of stale) {
    try {
      const owningJob = await prisma.job.findFirst({ where: { inputKey: session.objectKey }, select: { id: true } });
      if (owningJob) {
        await prisma.uploadSession.delete({ where: { id: session.id } });
      } else {
        await discardUpload(session);
      }
    } catch (error) {
      console.error(`Failed to clean up upload session ${session.id}`, error);
    }
  }

  return stale.length;
}
