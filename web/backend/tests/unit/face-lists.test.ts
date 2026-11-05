import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { createFaceList, deleteFaceList, getFaceStream, listFaceLists } from "../../src/services/face-list.service";
import * as faceListRepository from "../../src/repositories/face-list.repository";
import * as jobRepository from "../../src/repositories/job.repository";
import * as messaging from "../../src/messaging";
import { createDraftBatch, startBatch, rerunBatch } from "../../src/services/batch.service";
import { storage, UPLOADS_BUCKET } from "../../src/storage";
import {
  createFaceListHandler,
  deleteFaceListHandler,
  getFaceStreamHandler,
  listFaceListsHandler,
} from "../../src/controllers/face-lists.controller";
import { createBatchHandler, rerunBatchHandler } from "../../src/controllers/batches.controller";
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
    buffer: Buffer.from("image-bytes"),
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
      const bigFile = mockFile("big.jpg", "image/jpeg", config.UPLOAD_MAX_BYTES + 10);
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

  describe("Service: listFaceLists and getFaceStream", () => {
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

    it("streams face for valid index and returns streamInfo", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "My Faces",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date("2026-11-05T08:00:00Z"),
      });

      const mockStream = new Readable();
      vi.spyOn(storage, "getObjectStream").mockResolvedValue({
        stream: mockStream,
        contentType: "image/jpeg",
        contentLength: 1234,
      });

      const info = await getFaceStream(listId, 1, userId);
      expect(info.stream).toBe(mockStream);
      expect(info.contentType).toBe("image/jpeg");
    });

    it("throws 404 when list is missing or owned by another user", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);

      await expect(getFaceStream(listId, 1, otherUserId)).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    });

    it("throws 404 when face index is out of bounds (0 or > count)", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "My Faces",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date("2026-11-05T08:00:00Z"),
      });

      await expect(getFaceStream(listId, 0, userId)).rejects.toMatchObject({
        status: 404,
      });

      await expect(getFaceStream(listId, 2, userId)).rejects.toMatchObject({
        status: 404,
      });
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

      expect(copySpy).toHaveBeenCalledTimes(2);
      expect(copySpy).toHaveBeenNthCalledWith(
        1,
        UPLOADS_BUCKET,
        `lists/${userId}/${listId}/face-1.jpg`,
        `${batch.id}/whitelist/face-1.jpg`,
      );
      expect(copySpy).toHaveBeenNthCalledWith(
        2,
        UPLOADS_BUCKET,
        `lists/${userId}/${listId}/face-2.png`,
        `${batch.id}/whitelist/face-2.png`,
      );

      expect(createBatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          whitelistKeys: [`${batch.id}/whitelist/face-1.jpg`, `${batch.id}/whitelist/face-2.png`],
        }),
      );
      expect(batch.whitelistKeys).toEqual([`${batch.id}/whitelist/face-1.jpg`, `${batch.id}/whitelist/face-2.png`]);
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

    it("rejects with 400 VALIDATION_ERROR when both faceListId and whitelist files are sent", async () => {
      await expect(
        createDraftBatch({
          userId,
          faceListId: listId,
          whitelist: [mockFile("face1.jpg")],
          rawConfig: { targets: ["face"] },
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Use either a saved list or uploaded faces",
      });
    });

    it("rejects with 404 NOT_FOUND when faceListId belongs to another user or does not exist", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);

      await expect(
        createDraftBatch({
          userId,
          faceListId: listId,
          rawConfig: { targets: ["face"] },
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    });

    it("rejects batch create with 404 when faceListId is not a valid UUID without writing to storage", async () => {
      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
      const putSpy = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
      const createBatchSpy = vi.spyOn(jobRepository, "createDraftBatch");

      await expect(
        createDraftBatch({
          userId,
          faceListId: "not-a-uuid",
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
          faceListId: "not-a-uuid",
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
      expect(batch.whitelistKeys).toEqual([`${batch.id}/whitelist/face-1.jpg`]);

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
          whitelistKeys: [`${bId}/whitelist/face-1.jpg`],
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
            whitelistKeys: [`${bId}/whitelist/face-1.jpg`],
            whitelistDeletedAt: null,
            startedAt: new Date(),
            createdAt: new Date(),
          }) as any,
      );

      const rerunResult = await rerunBatch(sourceBatchId, {
        userId,
        faceListId: listId,
        rawConfig: { targets: ["face"] },
      });

      expect(rerunResult.batch.whitelistKeys).toEqual([`${newBatchId}/whitelist/face-1.jpg`]);
    });
  });

  describe("Controllers: HTTP handlers and Cache-Control headers", () => {
    it("getFaceStreamHandler sets Cache-Control: private, no-store", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "My Faces",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date(),
      });

      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      vi.spyOn(storage, "getObjectStream").mockResolvedValue({
        stream: mockStream,
        contentType: "image/jpeg",
        contentLength: 42,
      });

      const headers: Record<string, string | number> = {};
      const req: any = {
        params: { id: listId, n: "1" },
        authUser: { id: userId },
      };
      const res: any = {
        setHeader: vi.fn((k: string, v: any) => {
          headers[k] = v;
        }),
      };
      mockStream.pipe = vi.fn();

      await getFaceStreamHandler(req, res, vi.fn());

      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
      expect(res.setHeader).toHaveBeenCalledWith("Content-Length", 42);
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

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

    it("forwards 404 when foreign list is accessed on face stream or delete", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);

      const next1 = vi.fn();
      await getFaceStreamHandler(
        { params: { id: listId, n: "1" }, authUser: { id: otherUserId } } as any,
        {} as any,
        next1,
      );
      expect(next1).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));

      const next2 = vi.fn();
      await deleteFaceListHandler({ params: { id: listId }, authUser: { id: otherUserId } } as any, {} as any, next2);
      expect(next2).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    });
  });
});
