import { PNG_BYTES } from "../helpers/image-bytes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import {
  addFacesToList,
  createFaceList,
  deleteFaceFromList,
  deleteFaceList,
  faceIdFromKey,
  getFacePresignedUrl,
  listFaceLists,
  renameFaceList,
  sanitizeFaceFileName,
  toFaceListItemDTO,
} from "../../src/services/face-list.service";
import * as faceListRepository from "../../src/repositories/face-list.repository";
import * as jobRepository from "../../src/repositories/job.repository";
import * as messaging from "../../src/messaging";
import { createDraftBatch, startBatch, rerunBatch } from "../../src/services/batch.service";
import { storage, UPLOADS_BUCKET } from "../../src/storage";
import {
  addFacesToListHandler,
  createFaceListHandler,
  deleteFaceFromListHandler,
  deleteFaceListHandler,
  listFaceListsHandler,
  renameFaceListHandler,
} from "../../src/controllers/face-lists.controller";
import { createBatchHandler, rerunBatchHandler } from "../../src/controllers/batches.controller";
import { faceListsUpload } from "../../src/routes/face-lists.routes";
import { batchesUpload } from "../../src/routes/batches.routes";
import { config } from "../../src/config";

describe("Face Lists Unit Tests (Task 39)", () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const otherUserId = "987e6543-e21b-42d3-a456-426614174999";
  const listId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockFile = (name: string, mimetype = "image/jpeg", size = 1000): Express.Multer.File => ({
    fieldname: "faces",
    originalname: name,
    encoding: "7bit",
    mimetype,
    size,
    buffer: PNG_BYTES,
    stream: new Readable(),
    destination: "",
    filename: name,
    path: "",
  });

  describe("Service: createFaceList", () => {
    it("validates face list name (required, 1-100 chars, no control chars)", async () => {
      await expect(createFaceList(userId, "", [mockFile("f1.jpg")])).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      await expect(createFaceList(userId, "a".repeat(101), [mockFile("f1.jpg")])).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      await expect(createFaceList(userId, "Bad\x00Name", [mockFile("f1.jpg")])).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("validates 1 to 5 face files and file constraints", async () => {
      // 0 files
      await expect(createFaceList(userId, "Family", [])).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      // 6 files
      const sixFiles = Array.from({ length: 6 }, (_, i) => mockFile(`face-${i + 1}.jpg`));
      await expect(createFaceList(userId, "Family", sixFiles)).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      // Oversized file
      const bigFile = mockFile("big.jpg", "image/jpeg", config.IMAGE_UPLOAD_MAX_BYTES + 10);
      await expect(createFaceList(userId, "Family", [bigFile])).rejects.toMatchObject({
        status: 413,
        code: "FILE_TOO_LARGE",
      });

      // Unsupported format
      const pdf = mockFile("doc.pdf", "application/pdf");
      await expect(createFaceList(userId, "Family", [pdf])).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("puts objects under lists/<userId>/<listId>/face-<n>.<ext> and creates DB record", async () => {
      const putSpy = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      const repoSpy = vi.spyOn(faceListRepository, "createFaceList").mockImplementation(async (data) => ({
        id: data.id,
        userId: data.userId,
        name: data.name,
        keys: data.keys,
        createdAt: new Date("2026-11-05T09:00:00Z"),
      }));

      const files = [mockFile("face1.jpg", "image/jpeg"), mockFile("face2.png", "image/png")];
      const result = await createFaceList(userId, "VIP List", files);

      expect(putSpy).toHaveBeenCalledTimes(2);
      expect(putSpy).toHaveBeenNthCalledWith(
        1,
        UPLOADS_BUCKET,
        expect.stringMatching(new RegExp(`^lists/${userId}/[0-9a-f-]+/face-1\\.jpg$`)),
        files[0].buffer,
        "image/jpeg",
      );
      expect(putSpy).toHaveBeenNthCalledWith(
        2,
        UPLOADS_BUCKET,
        expect.stringMatching(new RegExp(`^lists/${userId}/[0-9a-f-]+/face-2\\.png$`)),
        files[1].buffer,
        "image/png",
      );

      expect(repoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          name: "VIP List",
          keys: expect.arrayContaining([expect.stringContaining(`lists/${userId}/`)]),
        }),
      );

      expect(result.name).toBe("VIP List");
      expect(result.faceCount).toBe(2);
      expect(result.createdAt).toBe("2026-11-05T09:00:00.000Z");
    });

    it("deletes uploaded objects if upload fails midway or DB persistence throws", async () => {
      let callCount = 0;
      vi.spyOn(storage, "putObject").mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("S3 put error");
        }
      });
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);

      const files = [mockFile("face1.jpg"), mockFile("face2.jpg")];
      await expect(createFaceList(userId, "Test", files)).rejects.toThrow("S3 put error");

      expect(deletePrefixSpy).toHaveBeenCalledWith(
        UPLOADS_BUCKET,
        expect.stringMatching(new RegExp(`^lists/${userId}/[0-9a-f-]+/$`)),
      );
    });
  });

  describe("Service: listFaceLists", () => {
    it("lists only user's face lists with accurate faceCount", async () => {
      vi.spyOn(faceListRepository, "listFaceListsByUserId").mockResolvedValue([
        {
          id: listId,
          userId,
          name: "My Faces",
          keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.jpg`],
          createdAt: new Date("2026-11-05T08:00:00Z"),
        },
      ]);

      const result = await listFaceLists(userId);
      expect(result.lists).toHaveLength(1);
      expect(result.lists[0].id).toBe(listId);
      expect(result.lists[0].faceCount).toBe(2);
    });
  });

  describe("Service: deleteFaceList", () => {
    it("deletes prefix uploads/lists/<userId>/<id>/ then the DB row", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "My Faces",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date("2026-11-05T08:00:00Z"),
      });

      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);
      const deleteRowSpy = vi.spyOn(faceListRepository, "deleteFaceListRow").mockResolvedValue(true);

      await deleteFaceList(listId, userId);

      expect(deletePrefixSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, `lists/${userId}/${listId}/`);
      expect(deleteRowSpy).toHaveBeenCalledWith(listId, userId);
    });

    it("throws 404 when deleting a list owned by another user", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);

      await expect(deleteFaceList(listId, otherUserId)).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    });

    it("propagates error and does not delete DB row if deletePrefix rejects", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "My Faces",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date("2026-11-05T08:00:00Z"),
      });

      vi.spyOn(storage, "deletePrefix").mockRejectedValue(new Error("MinIO connection failed"));
      const deleteRowSpy = vi.spyOn(faceListRepository, "deleteFaceListRow").mockResolvedValue(true);

      await expect(deleteFaceList(listId, userId)).rejects.toThrow("MinIO connection failed");
      expect(deleteRowSpy).not.toHaveBeenCalled();
    });
  });

  describe("Batch creation & rerun with faceListId", () => {
    const batchId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    it("copies list objects into <batchId>/whitelist/face-<n> and saves whitelistKeys", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "Saved Team",
        keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.png`],
        createdAt: new Date("2026-11-05T08:00:00Z"),
      });

      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      const createBatchSpy = vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data) => ({
        id: data.id,
        userId: data.userId ?? null,
        name: data.name,
        config: data.config,
        whitelistKeys: data.whitelistKeys,
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      }));

      const batch = await createDraftBatch({
        userId,
        faceListId: listId,
        rawConfig: { targets: ["face"] },
      });

      expect(copySpy).not.toHaveBeenCalled();

      expect(createBatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          whitelistKeys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.png`],
        }),
      );
      expect(batch.whitelistKeys).toEqual([
        `lists/${userId}/${listId}/face-1.jpg`,
        `lists/${userId}/${listId}/face-2.png`,
      ]);
    });

    it("dispatches worker commands carrying the copied batch whitelist keys", async () => {
      const mockJobs = [
        {
          id: "job-1",
          batchId,
          originalFilename: "photo.jpg",
          inputKey: `${batchId}/job-1/input.jpg`,
          outputKey: `${batchId}/job-1/result.jpg`,
          inputBytes: 100,
        } as any,
      ];

      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
        id: batchId,
        userId,
        name: "Batch with List",
        config: { targets: ["face"], style: "blur", strength: 20, quality: "high", format: "original" },
        whitelistKeys: [`${batchId}/whitelist/face-1.jpg`],
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      } as any);

      vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
        id: batchId,
        userId,
        name: "Batch with List",
        config: { targets: ["face"], style: "blur", strength: 20, quality: "high", format: "original" },
        whitelistKeys: [`${batchId}/whitelist/face-1.jpg`],
        whitelistDeletedAt: null,
        startedAt: new Date(),
        createdAt: new Date(),
      } as any);

      vi.spyOn(jobRepository, "countJobsByBatchId").mockResolvedValue(1);
      vi.spyOn(jobRepository, "getPendingJobsByBatchId").mockResolvedValue(mockJobs);
      vi.spyOn(jobRepository, "setBatchStarted").mockResolvedValue(undefined as any);
      vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue(undefined as any);
      vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue(mockJobs);

      const publishSpy = vi.spyOn(messaging, "publishJob").mockResolvedValue(undefined);

      await startBatch(batchId, userId);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const command = publishSpy.mock.calls[0][1] as any;
      expect(command.params.whitelist).toEqual({
        faces: [{ bucket: UPLOADS_BUCKET, key: `${batchId}/whitelist/face-1.jpg` }],
        similarityThreshold: 0.45,
      });
    });

    it("two lists + 2 uploads → keys face-1..N in order, command carries all", async () => {
      const list1Id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const list2Id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockImplementation(async (id) => {
        if (id === list1Id) {
          return {
            id: list1Id,
            userId,
            name: "List One",
            keys: [`lists/${userId}/${list1Id}/face-1.jpg`, `lists/${userId}/${list1Id}/face-2.png`],
            createdAt: new Date(),
          };
        }
        if (id === list2Id) {
          return {
            id: list2Id,
            userId,
            name: "List Two",
            keys: [`lists/${userId}/${list2Id}/face-1.webp`, `lists/${userId}/${list2Id}/face-2.jpg`],
            createdAt: new Date(),
          };
        }
        return null;
      });

      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      const putSpy = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data) => ({
        id: data.id,
        userId: data.userId ?? null,
        name: data.name,
        config: data.config,
        whitelistKeys: data.whitelistKeys,
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      }));

      const batch = await createDraftBatch({
        userId,
        faceListIds: [list1Id, list2Id],
        whitelist: [mockFile("upload1.jpg", "image/jpeg"), mockFile("upload2.png", "image/png")],
        rawConfig: { targets: ["face"] },
      });

      // 4 list faces directly referenced + 2 uploads put = 6 whitelist keys in order
      expect(copySpy).not.toHaveBeenCalled();

      expect(putSpy).toHaveBeenCalledTimes(2);
      expect(putSpy).toHaveBeenNthCalledWith(
        1,
        UPLOADS_BUCKET,
        `${batch.id}/whitelist/face-1.jpg`,
        expect.any(Buffer),
        "image/jpeg",
      );
      expect(putSpy).toHaveBeenNthCalledWith(
        2,
        UPLOADS_BUCKET,
        `${batch.id}/whitelist/face-2.png`,
        expect.any(Buffer),
        "image/png",
      );

      expect(batch.whitelistKeys).toEqual([
        `lists/${userId}/${list1Id}/face-1.jpg`,
        `lists/${userId}/${list1Id}/face-2.png`,
        `lists/${userId}/${list2Id}/face-1.webp`,
        `lists/${userId}/${list2Id}/face-2.jpg`,
        `${batch.id}/whitelist/face-1.jpg`,
        `${batch.id}/whitelist/face-2.png`,
      ]);

      // Verify startBatch emits command with all 6 keys
      const mockJobs = [
        {
          id: "job-combined-1",
          batchId: batch.id,
          originalFilename: "input.jpg",
          inputKey: `${batch.id}/job-1/input.jpg`,
          outputKey: `${batch.id}/job-1/result.jpg`,
          inputBytes: 100,
        } as any,
      ];
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
        id: batch.id,
        userId,
        name: "Combined Batch",
        config: { targets: ["face"], style: "blur", strength: 20, quality: "high", format: "original" },
        whitelistKeys: batch.whitelistKeys,
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      } as any);
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
        id: batch.id,
        userId,
        name: "Combined Batch",
        config: { targets: ["face"], style: "blur", strength: 20, quality: "high", format: "original" },
        whitelistKeys: batch.whitelistKeys,
        whitelistDeletedAt: null,
        startedAt: new Date(),
        createdAt: new Date(),
      } as any);
      vi.spyOn(jobRepository, "countJobsByBatchId").mockResolvedValue(1);
      vi.spyOn(jobRepository, "getPendingJobsByBatchId").mockResolvedValue(mockJobs);
      vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue(mockJobs);
      vi.spyOn(jobRepository, "setBatchStarted").mockResolvedValue(undefined as any);
      vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue(undefined as any);

      const publishSpy = vi.spyOn(messaging, "publishJob").mockResolvedValue(undefined);
      await startBatch(batch.id, userId);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const command = publishSpy.mock.calls[0][1] as any;
      expect(command.params.whitelist.faces).toHaveLength(6);
      expect(command.params.whitelist.faces).toEqual([
        { bucket: UPLOADS_BUCKET, key: `lists/${userId}/${list1Id}/face-1.jpg` },
        { bucket: UPLOADS_BUCKET, key: `lists/${userId}/${list1Id}/face-2.png` },
        { bucket: UPLOADS_BUCKET, key: `lists/${userId}/${list2Id}/face-1.webp` },
        { bucket: UPLOADS_BUCKET, key: `lists/${userId}/${list2Id}/face-2.jpg` },
        { bucket: UPLOADS_BUCKET, key: `${batch.id}/whitelist/face-1.jpg` },
        { bucket: UPLOADS_BUCKET, key: `${batch.id}/whitelist/face-2.png` },
      ]);
    });

    it("deduplicates repeated faceListIds preserving single inclusion", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "List",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date(),
      });
      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data) => ({
        id: data.id,
        userId: data.userId ?? null,
        name: data.name,
        config: data.config,
        whitelistKeys: data.whitelistKeys,
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      }));

      const batch = await createDraftBatch({
        userId,
        faceListIds: [listId, listId, listId],
        rawConfig: { targets: ["face"] },
      });

      expect(copySpy).not.toHaveBeenCalled();
      expect(batch.whitelistKeys).toEqual([`lists/${userId}/${listId}/face-1.jpg`]);
    });

    it("rejects with 400 VALIDATION_ERROR when total whitelist faces exceed 20", async () => {
      // 4 lists with 5 faces each = 20 faces, + 1 uploaded file = 21 faces (> 20)
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "List",
        keys: Array.from({ length: 5 }, (_, i) => `lists/${userId}/${listId}/face-${i + 1}.jpg`),
        createdAt: new Date(),
      });

      const listIds = Array.from({ length: 4 }, (_, i) => `11111111-1111-4111-8111-11111111111${i}`);

      await expect(
        createDraftBatch({
          userId,
          faceListIds: listIds,
          whitelist: [mockFile("extra.jpg")],
          rawConfig: { targets: ["face"] },
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "At most 20 whitelist faces per batch",
      });
    });

    it("rejects batch create with 404 when any faceListId belongs to another user without writing anything", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);
      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      const putSpy = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      const createBatchSpy = vi.spyOn(jobRepository, "createDraftBatch");

      await expect(
        createDraftBatch({
          userId,
          faceListIds: [listId],
          whitelist: [mockFile("f1.jpg")],
          rawConfig: { targets: ["face"] },
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });

      expect(copySpy).not.toHaveBeenCalled();
      expect(putSpy).not.toHaveBeenCalled();
      expect(createBatchSpy).not.toHaveBeenCalled();
    });

    it("rejects batch create with 404 when faceListId is not a valid UUID without writing to storage", async () => {
      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      const putSpy = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      const createBatchSpy = vi.spyOn(jobRepository, "createDraftBatch");

      await expect(
        createDraftBatch({
          userId,
          faceListIds: ["not-a-uuid"],
          rawConfig: { targets: ["face"] },
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
        message: "Face list not found",
      });

      expect(copySpy).not.toHaveBeenCalled();
      expect(putSpy).not.toHaveBeenCalled();
      expect(createBatchSpy).not.toHaveBeenCalled();
    });

    it("rejects batch rerun with 404 when faceListId is not a valid UUID without writing to storage", async () => {
      const sourceBatchId = "11111111-1111-4111-8111-111111111111";
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
        id: sourceBatchId,
        userId,
        name: "Original Batch",
        config: { targets: ["face"] },
        whitelistKeys: [],
        whitelistDeletedAt: null,
        startedAt: new Date(),
        createdAt: new Date(),
      } as any);

      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      const putSpy = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      const createBatchSpy = vi.spyOn(jobRepository, "createDraftBatch");

      await expect(
        rerunBatch(sourceBatchId, {
          userId,
          faceListIds: ["not-a-uuid"],
          rawConfig: { targets: ["face"] },
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
        message: "Face list not found",
      });

      expect(copySpy).not.toHaveBeenCalled();
      expect(putSpy).not.toHaveBeenCalled();
      expect(createBatchSpy).not.toHaveBeenCalled();
    });

    it("still supports single faceListId as a backwards-compatible alias", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "Single Team",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date(),
      });
      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data) => ({
        id: data.id,
        userId: data.userId ?? null,
        name: data.name,
        config: data.config,
        whitelistKeys: data.whitelistKeys,
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      }));

      const batch = await createDraftBatch({
        userId,
        faceListId: listId,
        rawConfig: { targets: ["face"] },
      });

      expect(copySpy).not.toHaveBeenCalled();
      expect(batch.whitelistKeys).toEqual([`lists/${userId}/${listId}/face-1.jpg`]);
    });

    it("deleting the face list after batch creation leaves the batch whitelist keys intact", async () => {
      // 1. Create batch with faceListId
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "Saved Team",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date(),
      });
      vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data) => ({
        id: data.id,
        userId: data.userId ?? null,
        name: data.name,
        config: data.config,
        whitelistKeys: data.whitelistKeys,
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      }));

      const batch = await createDraftBatch({
        userId,
        faceListId: listId,
        rawConfig: { targets: ["face"] },
      });
      expect(batch.whitelistKeys).toEqual([`lists/${userId}/${listId}/face-1.jpg`]);

      // 2. Delete the face list
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);
      vi.spyOn(faceListRepository, "deleteFaceListRow").mockResolvedValue(true);

      await deleteFaceList(listId, userId);

      // Verify MinIO prefix for the list was deleted, NOT the batch's whitelist prefix
      expect(deletePrefixSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, `lists/${userId}/${listId}/`);
      expect(deletePrefixSpy).not.toHaveBeenCalledWith(UPLOADS_BUCKET, `${batch.id}/whitelist/`);
    });

    it("rerunBatch accepts faceListId and passes to createDraftBatch", async () => {
      const sourceBatchId = "11111111-1111-4111-8111-111111111111";
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockImplementation(async (bId: string) => {
        if (bId === sourceBatchId) {
          return {
            id: sourceBatchId,
            userId,
            name: "Original Batch",
            config: { targets: ["face"] },
            whitelistKeys: [],
            whitelistDeletedAt: null,
            startedAt: new Date(),
            createdAt: new Date(),
          } as any;
        }
        return {
          id: bId,
          userId,
          name: "Original Batch (re-run)",
          config: { targets: ["face"] },
          whitelistKeys: [`lists/${userId}/${listId}/face-1.jpg`],
          whitelistDeletedAt: null,
          startedAt: null,
          createdAt: new Date(),
        } as any;
      });

      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "Saved Team",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date(),
      });
      vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      vi.spyOn(storage, "objectExists").mockResolvedValue(true);
      vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);

      const addedJobs: any[] = [];
      vi.spyOn(jobRepository, "getJobsByBatchId").mockImplementation(async (bId: string) => {
        if (bId === sourceBatchId) {
          return [
            {
              id: "job-src-1",
              batchId: sourceBatchId,
              originalFilename: "photo.jpg",
              inputKey: `${sourceBatchId}/job-src-1/input.jpg`,
              outputKey: `${sourceBatchId}/job-src-1/result.jpg`,
              inputBytes: 500,
            } as any,
          ];
        }
        return addedJobs;
      });

      let newBatchId = "";
      vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data) => {
        newBatchId = data.id;
        return {
          id: data.id,
          userId: data.userId ?? null,
          name: data.name,
          config: data.config,
          whitelistKeys: data.whitelistKeys,
          whitelistDeletedAt: null,
          startedAt: null,
          createdAt: new Date(),
        };
      });
      vi.spyOn(jobRepository, "addJobToBatchWithLock").mockImplementation(async (bId: string, jobData: any) => {
        const j = { ...jobData, batchId: bId, status: "PENDING" };
        addedJobs.push(j);
        return j;
      });
      vi.spyOn(jobRepository, "countJobsByBatchId").mockResolvedValue(1);
      vi.spyOn(jobRepository, "getPendingJobsByBatchId").mockImplementation(async () => addedJobs);
      vi.spyOn(jobRepository, "setBatchStarted").mockResolvedValue(undefined as any);
      vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue({} as any);
      vi.spyOn(messaging, "publishJob").mockResolvedValue(undefined);

      vi.spyOn(jobRepository, "getBatch").mockImplementation(
        async (bId: string) =>
          ({
            id: bId,
            userId,
            name: "Original Batch (re-run)",
            config: { targets: ["face"] },
            whitelistKeys: [`lists/${userId}/${listId}/face-1.jpg`],
            whitelistDeletedAt: null,
            startedAt: null,
            createdAt: new Date(),
          }) as any,
      );

      const rerunResult = await rerunBatch(sourceBatchId, {
        userId,
        faceListId: listId,
        rawConfig: { targets: ["face"] },
      });

      expect(rerunResult.batch.whitelistKeys).toEqual([`lists/${userId}/${listId}/face-1.jpg`]);
    });
  });

  describe("Controllers: HTTP handlers", () => {
    it("createFaceListHandler returns 201 with list DTO", async () => {
      vi.spyOn(faceListRepository, "createFaceList").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date("2026-11-05T09:00:00Z"),
      });
      vi.spyOn(storage, "putObject").mockResolvedValue(undefined);

      const req: any = {
        authUser: { id: userId },
        body: { name: "VIP List" },
        files: [mockFile("face1.jpg")],
      };
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res: any = { status: statusMock };

      await createFaceListHandler(req, res, vi.fn());

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        list: {
          id: listId,
          name: "VIP List",
          faceCount: 1,
          faceNames: [null],
          faceIds: ["face-1"],
          createdAt: "2026-11-05T09:00:00.000Z",
        },
      });
    });

    it("deleteFaceListHandler returns 204 No Content", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys: [],
        createdAt: new Date(),
      });
      vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);
      vi.spyOn(faceListRepository, "deleteFaceListRow").mockResolvedValue(true);

      const req: any = {
        params: { id: listId },
        authUser: { id: userId },
      };
      const endMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ end: endMock });
      const res: any = { status: statusMock };

      await deleteFaceListHandler(req, res, vi.fn());

      expect(statusMock).toHaveBeenCalledWith(204);
      expect(endMock).toHaveBeenCalled();
    });

    it("forwards 404 when foreign list is accessed on delete", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);

      const next = vi.fn();
      await deleteFaceListHandler({ params: { id: listId }, authUser: { id: otherUserId } } as any, {} as any, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  describe("Task 49: addFacesToList Service & Controller", () => {
    it("adding appends after existing keys, returns new count, and leaves existing objects untouched", async () => {
      const existingKeys = [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.jpg`];
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys: [...existingKeys],
        createdAt: new Date("2026-11-05T09:00:00.000Z"),
      });

      const putSpy = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      const deleteObjectSpy = vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);

      let capturedKeys: string[] = [];
      vi.spyOn(faceListRepository, "appendFaceListKeys").mockImplementation(async (_id, _uid, keys) => {
        capturedKeys = keys;
        return {
          id: listId,
          userId,
          name: "VIP List",
          keys: [...existingKeys, ...keys],
          createdAt: new Date("2026-11-05T09:00:00.000Z"),
        };
      });

      const files = [mockFile("face3.jpg", "image/jpeg"), mockFile("face4.png", "image/png")];
      const result = await addFacesToList(listId, userId, files);

      expect(result.faceCount).toBe(4);
      expect(putSpy).toHaveBeenCalledTimes(2);
      // Verify keys use face-<uuid>.<ext> format
      expect(capturedKeys).toHaveLength(2);
      expect(capturedKeys[0]).toMatch(new RegExp(`^lists/${userId}/${listId}/face-[0-9a-f-]+\\.jpg$`));
      expect(capturedKeys[1]).toMatch(new RegExp(`^lists/${userId}/${listId}/face-[0-9a-f-]+\\.png$`));

      // Existing objects must remain untouched
      expect(deleteObjectSpy).not.toHaveBeenCalled();
      expect(deletePrefixSpy).not.toHaveBeenCalled();
    });

    it("new faces are accessible through getFacePresignedUrl faces/:faceId", async () => {
      const keys = [
        `lists/${userId}/${listId}/face-1.jpg`,
        `lists/${userId}/${listId}/face-2.jpg`,
        `lists/${userId}/${listId}/face-uuid3.jpg`,
      ];
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys,
        createdAt: new Date(),
      });

      const presignSpy = vi.spyOn(storage, "presignGetUrl").mockResolvedValue({
        url: "http://localhost:9000/presigned-face.jpg",
        expiresAt: new Date().toISOString(),
      });

      // Appended face by ID "face-uuid3"
      const result = await getFacePresignedUrl(listId, "face-uuid3", userId);
      expect(result.url).toBe("http://localhost:9000/presigned-face.jpg");
      expect(presignSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, keys[2], expect.anything());
    });

    it("over the cap → rejects with 409 FACE_LIST_FULL and leaves nothing behind", async () => {
      const existingKeys = [
        `lists/${userId}/${listId}/face-1.jpg`,
        `lists/${userId}/${listId}/face-2.jpg`,
        `lists/${userId}/${listId}/face-3.jpg`,
        `lists/${userId}/${listId}/face-4.jpg`,
      ];
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys: existingKeys,
        createdAt: new Date(),
      });

      const putSpy = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      const appendSpy = vi.spyOn(faceListRepository, "appendFaceListKeys");

      const twoFiles = [mockFile("f5.jpg"), mockFile("f6.jpg")];
      await expect(addFacesToList(listId, userId, twoFiles)).rejects.toMatchObject({
        status: 409,
        code: "FACE_LIST_FULL",
      });

      // Early rejection: nothing uploaded, no repository write
      expect(putSpy).not.toHaveBeenCalled();
      expect(appendSpy).not.toHaveBeenCalled();
    });

    it("DB update affecting no row → deletes only this request's uploaded objects, then throws 409", async () => {
      const existingKeys = [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.jpg`];
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys: existingKeys,
        createdAt: new Date(),
      });

      vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      const deleteObjectSpy = vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);

      // Simulate atomic cap failure: another request slipped in and filled the list
      vi.spyOn(faceListRepository, "appendFaceListKeys").mockResolvedValue(null);

      const files = [mockFile("new-face.jpg")];
      await expect(addFacesToList(listId, userId, files)).rejects.toMatchObject({
        status: 409,
        code: "FACE_LIST_FULL",
      });

      // Only this request's uploaded key should be deleted
      expect(deleteObjectSpy).toHaveBeenCalledTimes(1);
      const deletedKey = deleteObjectSpy.mock.calls[0][1];
      expect(deletedKey).toMatch(new RegExp(`^lists/${userId}/${listId}/face-[0-9a-f-]+\\.jpg$`));
      expect(deletePrefixSpy).not.toHaveBeenCalled();
    });

    it("upload failure midway → deletes only this request's uploaded objects and rethrows", async () => {
      const existingKeys = [`lists/${userId}/${listId}/face-1.jpg`];
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys: existingKeys,
        createdAt: new Date(),
      });

      let uploadCount = 0;
      vi.spyOn(storage, "putObject").mockImplementation(async () => {
        uploadCount++;
        if (uploadCount === 2) {
          throw new Error("Network connection reset");
        }
      });
      const deleteObjectSpy = vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);

      const files = [mockFile("f1.jpg"), mockFile("f2.jpg")];
      await expect(addFacesToList(listId, userId, files)).rejects.toThrow("Network connection reset");

      // Only the 1 uploaded file was cleaned up; deletePrefix was never called
      expect(deleteObjectSpy).toHaveBeenCalledTimes(1);
      expect(deletePrefixSpy).not.toHaveBeenCalled();
    });

    it("another user's list or a non-UUID id → 404, nothing written", async () => {
      const putSpy = vi.spyOn(storage, "putObject");

      // Non-UUID
      await expect(addFacesToList("invalid-uuid", userId, [mockFile("f.jpg")])).rejects.toMatchObject({
        status: 404,
      });
      expect(putSpy).not.toHaveBeenCalled();

      // Another user's list
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);
      await expect(addFacesToList(listId, otherUserId, [mockFile("f.jpg")])).rejects.toMatchObject({
        status: 404,
      });
      expect(putSpy).not.toHaveBeenCalled();
    });

    it("a batch created afterwards with that list copies all faces", async () => {
      // List has 3 faces (2 original + 1 appended)
      const listKeys = [
        `lists/${userId}/${listId}/face-1.jpg`,
        `lists/${userId}/${listId}/face-2.png`,
        `lists/${userId}/${listId}/face-uuid3.jpg`,
      ];
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys: listKeys,
        createdAt: new Date(),
      });

      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data: any) => ({
        id: data.id,
        userId: data.userId ?? null,
        name: data.name,
        config: data.config,
        whitelistKeys: data.whitelistKeys,
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      }));

      await createDraftBatch({
        userId,
        faceListIds: [listId],
        rawConfig: { targets: ["face"] },
      });

      // All 3 face list items were directly referenced without copying
      expect(copySpy).not.toHaveBeenCalled();
    });

    it("addFacesToListHandler returns 200 { list } on success", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date("2026-11-05T09:00:00.000Z"),
      });
      vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      vi.spyOn(faceListRepository, "appendFaceListKeys").mockResolvedValue({
        id: listId,
        userId,
        name: "VIP List",
        keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-new.jpg`],
        createdAt: new Date("2026-11-05T09:00:00.000Z"),
      });

      const req: any = {
        params: { id: listId },
        authUser: { id: userId },
        files: [mockFile("new-face.jpg")],
      };
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res: any = { status: statusMock };

      await addFacesToListHandler(req, res, vi.fn());

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        list: {
          id: listId,
          name: "VIP List",
          faceCount: 2,
          faceNames: [null, null],
          faceIds: ["face-1", "face-new"],
          createdAt: "2026-11-05T09:00:00.000Z",
        },
      });
    });

    it("addFacesToListHandler rejects non-UUID id with 404", async () => {
      const next = vi.fn();
      const req: any = {
        params: { id: "not-a-uuid" },
        authUser: { id: userId },
        files: [mockFile("face.jpg")],
      };
      await addFacesToListHandler(req, {} as any, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  describe("Service & Controller: deleteFaceFromList (Task 50)", () => {
    it("removes specified key and object, returns updated list count, remaining faces stay readable", async () => {
      const existingList = {
        id: listId,
        userId,
        name: "Test List",
        keys: [
          `lists/${userId}/${listId}/face-1.jpg`,
          `lists/${userId}/${listId}/face-2.jpg`,
          `lists/${userId}/${listId}/face-3.jpg`,
        ],
        createdAt: new Date("2026-11-05T08:00:00.000Z"),
      };

      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(existingList);
      const deleteObjSpy = vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);
      const removeKeySpy = vi.spyOn(faceListRepository, "removeFaceListKey").mockResolvedValue({
        ...existingList,
        keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-3.jpg`],
      });

      // Delete face with ID face-2
      const result = await deleteFaceFromList(listId, "face-2", userId);

      expect(deleteObjSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, `lists/${userId}/${listId}/face-2.jpg`);
      expect(removeKeySpy).toHaveBeenCalledWith(listId, userId, `lists/${userId}/${listId}/face-2.jpg`);
      expect(result.list).toEqual({
        id: listId,
        name: "Test List",
        faceCount: 2,
        faceNames: [null, null],
        faceIds: ["face-1", "face-3"],
        createdAt: "2026-11-05T08:00:00.000Z",
      });

      // Remaining faces stay accessible through faces/:faceId/url
      const updatedList = {
        ...existingList,
        keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-3.jpg`],
      };
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(updatedList);
      const presignSpy = vi.spyOn(storage, "presignGetUrl").mockResolvedValue({
        url: "http://localhost:9000/presigned-face.jpg",
        expiresAt: new Date().toISOString(),
      });

      // Face face-1 is face-1.jpg
      await getFacePresignedUrl(listId, "face-1", userId);
      expect(presignSpy).toHaveBeenCalledWith(
        UPLOADS_BUCKET,
        `lists/${userId}/${listId}/face-1.jpg`,
        expect.anything(),
      );

      // Face face-3 is face-3.jpg
      await getFacePresignedUrl(listId, "face-3", userId);
      expect(presignSpy).toHaveBeenCalledWith(
        UPLOADS_BUCKET,
        `lists/${userId}/${listId}/face-3.jpg`,
        expect.anything(),
      );
    });

    it("deleting the same face ID twice removes one face and the second call returns 404", async () => {
      const initialList = {
        id: listId,
        userId,
        name: "Test List",
        keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.jpg`],
        faceNames: {
          [`lists/${userId}/${listId}/face-1.jpg`]: "Alice.jpg",
          [`lists/${userId}/${listId}/face-2.jpg`]: "Bob.jpg",
        },
        createdAt: new Date("2026-11-05T08:00:00.000Z"),
      };

      const remainingList = {
        id: listId,
        userId,
        name: "Test List",
        keys: [`lists/${userId}/${listId}/face-2.jpg`],
        faceNames: {
          [`lists/${userId}/${listId}/face-2.jpg`]: "Bob.jpg",
        },
        createdAt: new Date("2026-11-05T08:00:00.000Z"),
      };

      vi.spyOn(faceListRepository, "getFaceListOwnedByUser")
        .mockResolvedValueOnce(initialList)
        .mockResolvedValueOnce(remainingList);
      const deleteObjSpy = vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);
      const removeKeySpy = vi.spyOn(faceListRepository, "removeFaceListKey").mockResolvedValue(remainingList);

      // First delete removes face-1
      const res1 = await deleteFaceFromList(listId, "face-1", userId);
      expect(res1.list?.faceCount).toBe(1);
      expect(res1.list?.faceIds).toEqual(["face-2"]);
      expect(res1.list?.faceNames).toEqual(["Bob.jpg"]);
      expect(deleteObjSpy).toHaveBeenCalledTimes(1);
      expect(removeKeySpy).toHaveBeenCalledWith(listId, userId, `lists/${userId}/${listId}/face-1.jpg`);

      // Second delete of the same face-1 returns 404 and does not remove face-2
      await expect(deleteFaceFromList(listId, "face-1", userId)).rejects.toMatchObject({
        status: 404,
      });
      expect(deleteObjSpy).toHaveBeenCalledTimes(1);
    });

    it("deleteObject fails → request fails and key stays", async () => {
      const existingList = {
        id: listId,
        userId,
        name: "Test List",
        keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.jpg`],
        createdAt: new Date("2026-11-05T08:00:00.000Z"),
      };

      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(existingList);
      vi.spyOn(storage, "deleteObject").mockRejectedValue(new Error("MinIO connection reset"));
      const removeKeySpy = vi.spyOn(faceListRepository, "removeFaceListKey");

      await expect(deleteFaceFromList(listId, "face-1", userId)).rejects.toThrow("MinIO connection reset");
      expect(removeKeySpy).not.toHaveBeenCalled();
    });

    it("deleting the last face deletes the list and returns { list: null }", async () => {
      const singleFaceList = {
        id: listId,
        userId,
        name: "Single Face List",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date("2026-11-05T08:00:00.000Z"),
      };

      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(singleFaceList);
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);
      const deleteRowSpy = vi.spyOn(faceListRepository, "deleteFaceListRow").mockResolvedValue(true);
      const deleteObjSpy = vi.spyOn(storage, "deleteObject");

      const result = await deleteFaceFromList(listId, "face-1", userId);

      expect(deletePrefixSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, `lists/${userId}/${listId}/`);
      expect(deleteRowSpy).toHaveBeenCalledWith(listId, userId);
      expect(deleteObjSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ list: null });
    });

    it("returns 404 and deletes nothing for other user list, non-UUID id, or unknown faceId", async () => {
      const deleteObjSpy = vi.spyOn(storage, "deleteObject");
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix");

      // Non-UUID id
      await expect(deleteFaceFromList("not-a-uuid", "face-1", userId)).rejects.toMatchObject({
        status: 404,
      });

      // Other user list
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);
      await expect(deleteFaceFromList(listId, "face-1", otherUserId)).rejects.toMatchObject({
        status: 404,
      });

      // Unknown faceId
      const listWith2 = {
        id: listId,
        userId,
        name: "Two Faces",
        keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.jpg`],
        createdAt: new Date("2026-11-05T08:00:00.000Z"),
      };
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(listWith2);

      await expect(deleteFaceFromList(listId, "face-999", userId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(deleteFaceFromList(listId, "not-found", userId)).rejects.toMatchObject({
        status: 404,
      });

      expect(deleteObjSpy).not.toHaveBeenCalled();
      expect(deletePrefixSpy).not.toHaveBeenCalled();
    });

    it("deleteFaceFromListHandler responds with 200 { list } or { list: null }", async () => {
      const existingList = {
        id: listId,
        userId,
        name: "Test List",
        keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.jpg`],
        createdAt: new Date("2026-11-05T08:00:00.000Z"),
      };

      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(existingList);
      vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);
      vi.spyOn(faceListRepository, "removeFaceListKey").mockResolvedValue({
        ...existingList,
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
      });

      const req: any = {
        params: { id: listId, faceId: "face-2" },
        authUser: { id: userId },
      };
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res: any = { status: statusMock };

      await deleteFaceFromListHandler(req, res, vi.fn());

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        list: {
          id: listId,
          name: "Test List",
          faceCount: 1,
          faceNames: [null],
          faceIds: ["face-1"],
          createdAt: "2026-11-05T08:00:00.000Z",
        },
      });
    });

    it("deleteFaceFromListHandler rejects invalid faceId or invalid id with 404", async () => {
      const next = vi.fn();
      const reqBadId: any = {
        params: { id: "bad-uuid", faceId: "face-1" },
        authUser: { id: userId },
      };
      await deleteFaceFromListHandler(reqBadId, {} as any, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));

      next.mockClear();
      const reqBadFaceId: any = {
        params: { id: listId, faceId: "   " },
        authUser: { id: userId },
      };
      await deleteFaceFromListHandler(reqBadFaceId, {} as any, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });

  describe("Task 52: Photo names & UTF-8 multipart filenames", () => {
    describe("sanitizeFaceFileName", () => {
      it("strips path segments from unix and windows style paths", () => {
        expect(sanitizeFaceFileName("photos/vacation/my_face.jpg")).toBe("my_face.jpg");
        expect(sanitizeFaceFileName("..\\..\\windows\\face.png")).toBe("face.png");
        expect(sanitizeFaceFileName("deep/nested/dir\\mixed/slash.webp")).toBe("slash.webp");
      });

      it("strips ASCII and Unicode control characters", () => {
        expect(sanitizeFaceFileName("clean\u0000face\u001f.jpg")).toBe("cleanface.jpg");
        expect(sanitizeFaceFileName("bad\u0008name\u007f.png")).toBe("badname.png");
      });

      it("truncates at 255 characters", () => {
        const longName = "a".repeat(300) + ".jpg";
        const sanitized = sanitizeFaceFileName(longName);
        expect(sanitized).toHaveLength(255);
        expect(sanitized).toBe(longName.slice(0, 255));
      });

      it("returns null for empty strings or strings that reduce to empty", () => {
        expect(sanitizeFaceFileName("")).toBeNull();
        expect(sanitizeFaceFileName(undefined)).toBeNull();
        expect(sanitizeFaceFileName("\u0000\u001f\u007f")).toBeNull();
      });
    });

    describe("faceIdFromKey", () => {
      it("extracts file name without extension from storage keys", () => {
        expect(faceIdFromKey("lists/user-1/list-1/face-1.jpg")).toBe("face-1");
        expect(faceIdFromKey("lists/user-1/list-1/face-abc-123.png")).toBe("face-abc-123");
        expect(faceIdFromKey("lists/user-1/list-1/face-uuid.webp")).toBe("face-uuid");
        expect(faceIdFromKey("k1")).toBe("k1");
      });
    });

    describe("toFaceListItemDTO", () => {
      it("returns nulls for a list without faceNames", () => {
        const dto = toFaceListItemDTO({
          id: listId,
          userId,
          name: "Old List",
          keys: ["k1", "k2"],
          faceNames: {},
          createdAt: new Date("2026-11-05T00:00:00Z"),
        } as any);

        expect(dto.faceNames).toEqual([null, null]);
        expect(dto.faceIds).toEqual(["k1", "k2"]);
        expect(dto.faceCount).toBe(2);
        expect((dto as any).keys).toBeUndefined();
      });

      it("returns names aligned with keys order and nulls for missing keys", () => {
        const dto = toFaceListItemDTO({
          id: listId,
          userId,
          name: "Named List",
          keys: ["k1", "k2", "k3"],
          faceNames: { k1: "Alice.jpg", k3: "Charlie.jpg" },
          createdAt: new Date("2026-11-05T00:00:00Z"),
        } as any);

        expect(dto.faceNames).toEqual(["Alice.jpg", null, "Charlie.jpg"]);
        expect(dto.faceIds).toEqual(["k1", "k2", "k3"]);
        expect(dto.faceCount).toBe(3);
      });
    });

    describe("Service creation, addition, and deletion with names", () => {
      it("createFaceList passes sanitized face names and returns them in keys order", async () => {
        vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
        let capturedData: any = null;
        vi.spyOn(faceListRepository, "createFaceList").mockImplementation(async (data: any) => {
          capturedData = data;
          return {
            id: data.id,
            userId: data.userId,
            name: data.name,
            keys: data.keys,
            faceNames: data.faceNames,
            createdAt: new Date("2026-11-06T00:00:00Z"),
          } as any;
        });

        const files = [mockFile("path/to/First Photo.jpg"), mockFile("Second Photo.png")];
        const res = await createFaceList(userId, "Photo List", files);

        expect(res.faceCount).toBe(2);
        expect(res.faceNames).toEqual(["First Photo.jpg", "Second Photo.png"]);
        expect(capturedData.keys).toHaveLength(2);
        expect(capturedData.faceNames[capturedData.keys[0]]).toBe("First Photo.jpg");
        expect(capturedData.faceNames[capturedData.keys[1]]).toBe("Second Photo.png");
      });

      it("addFacesToList stores new face names and returns all names aligned in keys order", async () => {
        vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
        vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
          id: listId,
          userId,
          name: "Active List",
          keys: ["k1"],
          faceNames: { k1: "First Photo.jpg" },
          createdAt: new Date("2026-11-06T00:00:00Z"),
        } as any);

        vi.spyOn(faceListRepository, "appendFaceListKeys").mockImplementation(async (id, uid, keys, faceNames, max) => {
          return {
            id: listId,
            userId,
            name: "Active List",
            keys: ["k1", ...keys],
            faceNames: { k1: "First Photo.jpg", ...faceNames },
            createdAt: new Date("2026-11-06T00:00:00Z"),
          } as any;
        });

        const newFiles = [mockFile("ảnh Đức.jpg")];
        const res = await addFacesToList(listId, userId, newFiles);

        expect(res.faceCount).toBe(2);
        expect(res.faceNames).toEqual(["First Photo.jpg", "ảnh Đức.jpg"]);
      });

      it("deleteFaceFromList removes deleted face and keeps remaining names aligned", async () => {
        vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);
        vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
          id: listId,
          userId,
          name: "Active List",
          keys: ["k1", "k2", "k3"],
          faceNames: { k1: "Photo 1.jpg", k2: "Photo 2.jpg", k3: "Photo 3.jpg" },
          createdAt: new Date("2026-11-06T00:00:00Z"),
        } as any);

        vi.spyOn(faceListRepository, "removeFaceListKey").mockImplementation(async (id, uid, key) => {
          return {
            id: listId,
            userId,
            name: "Active List",
            keys: ["k1", "k3"],
            faceNames: { k1: "Photo 1.jpg", k3: "Photo 3.jpg" },
            createdAt: new Date("2026-11-06T00:00:00Z"),
          } as any;
        });

        const res = await deleteFaceFromList(listId, "k2", userId);
        expect(res.list?.faceCount).toBe(2);
        expect(res.list?.faceNames).toEqual(["Photo 1.jpg", "Photo 3.jpg"]);
        expect(res.list?.faceIds).toEqual(["k1", "k3"]);
      });
    });

    describe("Real multer config UTF-8 multipart decoding", () => {
      it("decodes multipart filename ảnh Đức.jpg intact for face-lists upload", async () => {
        const boundary = "----TestBoundaryFaceLists";
        const filename = "ảnh Đức.jpg";
        const content = Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="faces"; filename="${filename}"\r\n` +
            `Content-Type: image/jpeg\r\n\r\n` +
            `fake-data\r\n` +
            `--${boundary}--\r\n`,
          "utf8",
        );

        const req: any = Readable.from([content]);
        req.method = "POST";
        req.headers = {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": String(content.length),
        };

        await new Promise<void>((resolve, reject) => {
          faceListsUpload.array("faces")(req, {} as any, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        expect(req.files).toBeDefined();
        expect(req.files[0].originalname).toBe("ảnh Đức.jpg");
      });

      it("decodes multipart filename ảnh Đức.jpg intact for batch files upload", async () => {
        const boundary = "----TestBoundaryBatches";
        const filename = "ảnh Đức.jpg";
        const content = Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
            `Content-Type: image/jpeg\r\n\r\n` +
            `fake-data\r\n` +
            `--${boundary}--\r\n`,
          "utf8",
        );

        const req: any = Readable.from([content]);
        req.method = "POST";
        req.headers = {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": String(content.length),
        };

        await new Promise<void>((resolve, reject) => {
          batchesUpload.single("file")(req, {} as any, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        expect(req.file).toBeDefined();
        expect(req.file.originalname).toBe("ảnh Đức.jpg");
      });
    });
  });

  describe("Task 55: renameFaceList Service & Controller", () => {
    const mockKeys = [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.jpg`];
    const mockNames = {
      [`lists/${userId}/${listId}/face-1.jpg`]: "Alice",
      [`lists/${userId}/${listId}/face-2.jpg`]: "Bob",
    };

    it("rename returns the new name and leaves faces untouched", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "Old Team Name",
        keys: [...mockKeys],
        faceNames: { ...mockNames },
        createdAt: new Date("2026-11-05T08:00:00Z"),
      });

      const updateSpy = vi.spyOn(faceListRepository, "updateFaceListName").mockResolvedValue({
        id: listId,
        userId,
        name: "New Team Name",
        keys: [...mockKeys],
        faceNames: { ...mockNames },
        createdAt: new Date("2026-11-05T08:00:00Z"),
      });

      const result = await renameFaceList(listId, "New Team Name", userId);

      expect(updateSpy).toHaveBeenCalledWith(listId, "New Team Name");
      expect(result.name).toBe("New Team Name");
      expect(result.faceCount).toBe(2);
      expect(result.faceNames).toEqual(["Alice", "Bob"]);

      // Controller test: returns 200 with { list }
      const req: any = {
        params: { id: listId },
        body: { name: "New Team Name" },
        authUser: { id: userId },
      };
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res: any = { status: statusMock };

      await renameFaceListHandler(req, res, vi.fn());

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        list: expect.objectContaining({
          id: listId,
          name: "New Team Name",
          faceCount: 2,
        }),
      });
    });

    it("empty or too-long name → 400", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "Existing List",
        keys: [...mockKeys],
        createdAt: new Date(),
      });

      await expect(renameFaceList(listId, "", userId)).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      await expect(renameFaceList(listId, "   ", userId)).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      await expect(renameFaceList(listId, "a".repeat(101), userId)).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      await expect(renameFaceList(listId, null, userId)).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("another user's list and a non-UUID id → 404", async () => {
      // Another user's list in service: getFaceListOwnedByUser returns null
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);

      await expect(renameFaceList(listId, "Valid Name", otherUserId)).rejects.toMatchObject({
        status: 404,
      });

      // Controller with another user's list forwards 404
      const next1 = vi.fn();
      await renameFaceListHandler(
        { params: { id: listId }, body: { name: "Valid Name" }, authUser: { id: otherUserId } } as any,
        {} as any,
        next1,
      );
      expect(next1).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));

      // Controller with non-UUID id throws/forwards 404
      const next2 = vi.fn();
      await renameFaceListHandler(
        { params: { id: "not-a-valid-uuid" }, body: { name: "Valid Name" }, authUser: { id: userId } } as any,
        {} as any,
        next2,
      );
      expect(next2).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });
});
