import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/db/prisma";
import * as storageModule from "../../src/storage";
import * as batchRepository from "../../src/repositories/job.repository";
import * as batchService from "../../src/services/batch.service";
import * as videoValidation from "../../src/services/video-validation.service";
import { config } from "../../src/config";
import { beginMultipartUpload, finishMultipartUpload, writeMultipartPart } from "../../src/services/upload.service";
import {
  ABANDONED_UPLOAD_IDLE_MS,
  abortBatchUploads,
  cleanupAbandonedUploads,
} from "../../src/services/upload-cleanup.service";

const userId = "11111111-1111-4111-8111-111111111111";
const session = {
  id: "22222222-2222-4222-8222-222222222222",
  userId,
  batchId: "33333333-3333-4333-8333-333333333333",
  objectKey: "batch/key/input.mp4",
  filename: "clip.mp4",
  contentType: "video/mp4",
  totalBytes: 1000,
  uploadId: "s3-upload-id",
};
const parts = [
  { partNumber: 1, etag: "a" },
  { partNumber: 2, etag: "b" },
];

/** Stubs the storage and database calls finishMultipartUpload makes, and returns the spies to assert on. */
function arrange(options: { assembledBytes?: number; validation?: "ok" | "invalid" } = {}) {
  vi.spyOn(prisma.uploadSession, "findFirst").mockResolvedValue(session as never);
  const deleteSession = vi.spyOn(prisma.uploadSession, "delete").mockResolvedValue(session as never);
  vi.spyOn(storageModule, "completeMultipartUpload").mockResolvedValue(undefined);
  vi.spyOn(storageModule, "statObject").mockResolvedValue(options.assembledBytes ?? session.totalBytes);
  const abort = vi.spyOn(storageModule, "abortMultipartUpload").mockResolvedValue(undefined);
  const deleteObject = vi.spyOn(storageModule.storage, "deleteObject").mockResolvedValue(undefined);
  if (options.validation === "invalid") {
    vi.spyOn(videoValidation, "validateUploadedVideo").mockRejectedValue(new Error("not a valid video"));
  } else {
    vi.spyOn(videoValidation, "validateUploadedVideo").mockResolvedValue(undefined);
  }
  const addJob = vi.spyOn(batchService, "addBatchStoredObject").mockResolvedValue({ id: "job-1" } as never);
  return { deleteSession, abort, deleteObject, addJob };
}

describe("upload service", () => {
  afterEach(() => vi.restoreAllMocks());

  it("only starts multipart uploads for MP4 videos", async () => {
    await expect(beginMultipartUpload(userId, session.batchId, "photo.jpg", "image/jpeg", 100)).rejects.toMatchObject({
      code: "INVALID_MEDIA_TYPE",
    });
  });

  it("completes a valid upload: creates the job and drops the session without discarding the video", async () => {
    const { addJob, deleteSession, abort, deleteObject } = arrange();

    const job = await finishMultipartUpload(userId, session.id, parts);

    expect(job).toMatchObject({ id: "job-1" });
    expect(addJob).toHaveBeenCalledTimes(1);
    expect(deleteSession).toHaveBeenCalledTimes(1);
    expect(abort).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("rejects parts that are not consecutive without touching storage", async () => {
    const { abort, addJob } = arrange();

    await expect(
      finishMultipartUpload(userId, session.id, [
        { partNumber: 1, etag: "a" },
        { partNumber: 3, etag: "c" },
      ]),
    ).rejects.toMatchObject({ code: "INVALID_UPLOAD_PARTS" });

    expect(addJob).not.toHaveBeenCalled();
    expect(abort).not.toHaveBeenCalled();
  });

  it("discards the upload and its session when the assembled size differs from the declared size", async () => {
    const { addJob, deleteSession, abort, deleteObject } = arrange({ assembledBytes: 999 });

    await expect(finishMultipartUpload(userId, session.id, parts)).rejects.toMatchObject({
      code: "UPLOAD_SIZE_MISMATCH",
    });

    expect(addJob).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteSession).toHaveBeenCalledTimes(1);
  });

  it("discards the upload when video validation fails", async () => {
    const { addJob, deleteSession, deleteObject } = arrange({ validation: "invalid" });

    await expect(finishMultipartUpload(userId, session.id, parts)).rejects.toThrow("not a valid video");

    expect(addJob).not.toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteSession).toHaveBeenCalledTimes(1);
  });

  it("keeps the video when only deleting the session row fails after the job was created", async () => {
    const { deleteObject } = arrange();
    vi.spyOn(prisma.uploadSession, "delete").mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(finishMultipartUpload(userId, session.id, parts)).resolves.toMatchObject({ id: "job-1" });

    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("allows a video above the photo limit but not above the video limit", async () => {
    vi.spyOn(batchRepository, "getBatchOwnedByUser").mockResolvedValue({ id: session.batchId } as never);
    vi.spyOn(storageModule, "createMultipartUpload").mockResolvedValue("s3-upload-id");
    vi.spyOn(prisma.uploadSession, "create").mockResolvedValue(session as never);

    await expect(
      beginMultipartUpload(userId, session.batchId, "clip.mp4", "video/mp4", config.IMAGE_UPLOAD_MAX_BYTES + 1),
    ).resolves.toBeDefined();

    await expect(
      beginMultipartUpload(userId, session.batchId, "clip.mp4", "video/mp4", config.VIDEO_UPLOAD_MAX_BYTES + 1),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("refuses a part number beyond what the declared size needs", async () => {
    // 1000 declared bytes need exactly one part.
    vi.spyOn(prisma.uploadSession, "findFirst").mockResolvedValue(session as never);
    const store = vi.spyOn(storageModule, "uploadPart").mockResolvedValue("etag");
    const touch = vi.spyOn(prisma.uploadSession, "update").mockResolvedValue(session as never);

    await expect(writeMultipartPart(userId, session.id, 1, Buffer.alloc(10))).resolves.toBe("etag");
    expect(touch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: session.id }, data: { lastActivityAt: expect.any(Date) } }),
    );
    await expect(writeMultipartPart(userId, session.id, 2, Buffer.alloc(10))).rejects.toThrow(/part number/i);

    expect(store).toHaveBeenCalledTimes(1);
    expect(config.UPLOAD_CHUNK_BYTES).toBeGreaterThan(5 * 1024 * 1024);
  });
});

describe("abandoned upload cleanup", () => {
  afterEach(() => vi.restoreAllMocks());

  const old = { ...session, lastActivityAt: new Date(Date.now() - 7 * 60 * 60 * 1000) };

  it("selects sessions by idle time, so an upload still receiving parts is left alone", async () => {
    const find = vi.spyOn(prisma.uploadSession, "findMany").mockResolvedValue([]);
    const now = Date.now();

    await cleanupAbandonedUploads(now);

    expect(find).toHaveBeenCalledWith({
      where: { lastActivityAt: { lt: new Date(now - ABANDONED_UPLOAD_IDLE_MS) } },
    });
  });

  it("discards an idle session that no job owns: aborts the upload and removes the row", async () => {
    vi.spyOn(prisma.uploadSession, "findMany").mockResolvedValue([old] as never);
    vi.spyOn(prisma.job, "findFirst").mockResolvedValue(null);
    const abort = vi.spyOn(storageModule, "abortMultipartUpload").mockResolvedValue(undefined);
    vi.spyOn(storageModule.storage, "deleteObject").mockResolvedValue(undefined);
    const deleteSession = vi.spyOn(prisma.uploadSession, "delete").mockResolvedValue(old as never);

    expect(await cleanupAbandonedUploads()).toBe(1);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(deleteSession).toHaveBeenCalledTimes(1);
  });

  it("only removes the row when a job already owns the video", async () => {
    vi.spyOn(prisma.uploadSession, "findMany").mockResolvedValue([old] as never);
    vi.spyOn(prisma.job, "findFirst").mockResolvedValue({ id: "job-1" } as never);
    const abort = vi.spyOn(storageModule, "abortMultipartUpload").mockResolvedValue(undefined);
    const deleteObject = vi.spyOn(storageModule.storage, "deleteObject").mockResolvedValue(undefined);
    const deleteSession = vi.spyOn(prisma.uploadSession, "delete").mockResolvedValue(old as never);

    await cleanupAbandonedUploads();

    expect(deleteSession).toHaveBeenCalledTimes(1);
    expect(abort).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("aborts a batch's unfinished uploads before the batch is deleted", async () => {
    vi.spyOn(prisma.uploadSession, "findMany").mockResolvedValue([session] as never);
    const abort = vi.spyOn(storageModule, "abortMultipartUpload").mockResolvedValue(undefined);

    await abortBatchUploads(session.batchId);

    expect(abort).toHaveBeenCalledWith(storageModule.UPLOADS_BUCKET, session.objectKey, session.uploadId);
  });
});
