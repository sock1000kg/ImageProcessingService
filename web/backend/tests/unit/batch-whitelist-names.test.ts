import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { createDraftBatch, getBatchWhitelistStream } from "../../src/services/batch.service";
import * as jobRepository from "../../src/repositories/job.repository";
import * as faceListRepository from "../../src/repositories/face-list.repository";
import { storage, UPLOADS_BUCKET } from "../../src/storage";
import { toReportResponse } from "../../src/dto/batch.dto";
import {
  createBatchHandler,
  getBatchWhitelistPhotoHandler,
  rerunBatchHandler,
} from "../../src/controllers/batches.controller";
import { getJobOriginalHandler } from "../../src/controllers/jobs.controller";
import * as batchService from "../../src/services/batch.service";

describe("Batch Whitelist Names and Private Image Endpoint (Task 58)", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const otherUserId = "22222222-2222-4222-8222-222222222222";
  const batchId = "33333333-3333-4333-8333-333333333333";
  const listId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockFile = (name: string): Express.Multer.File => ({
    fieldname: "whitelist",
    originalname: name,
    encoding: "7bit",
    mimetype: "image/jpeg",
    size: 1000,
    buffer: Buffer.from("fake-img-data"),
    stream: new Readable(),
    destination: "",
    filename: name,
    path: "",
  });

  it("snapshots list face names and uploaded face names in whitelistKeys order", async () => {
    const listKey = `lists/${userId}/${listId}/face-1.jpg`;
    vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
      id: listId,
      userId,
      name: "VIP List",
      keys: [listKey],
      faceNames: { [listKey]: "alice_profile.jpg" },
      createdAt: new Date(),
    } as any);

    vi.spyOn(storage, "putObject").mockResolvedValue();

    let capturedCreateData: any = null;
    vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data: any) => {
      capturedCreateData = data;
      return {
        id: data.id,
        userId: data.userId,
        name: data.name,
        config: data.config,
        whitelistKeys: data.whitelistKeys,
        whitelistNames: data.whitelistNames,
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      } as any;
    });

    const batch = await createDraftBatch({
      faceListIds: [listId],
      whitelist: [mockFile("bob_id.jpg")],
      userId,
      rawConfig: {},
      name: "Test Batch",
    });

    expect(batch).toBeDefined();
    expect(capturedCreateData).toBeDefined();
    expect(capturedCreateData.whitelistKeys).toHaveLength(2);
    expect(capturedCreateData.whitelistKeys[0]).toBe(listKey);
    const uploadedKey = capturedCreateData.whitelistKeys[1];
    expect(uploadedKey).toMatch(/\/whitelist\/face-1\.jpg$/);

    // Verify snapshot map on the batch
    expect(capturedCreateData.whitelistNames[listKey]).toBe("alice_profile.jpg");
    expect(capturedCreateData.whitelistNames[uploadedKey]).toBe("bob_id.jpg");

    // Verify report reflects the snapshotted names
    const report = toReportResponse(capturedCreateData, []);
    expect(report.whitelistPeople).toHaveLength(2);
    expect(report.whitelistPeople[0]?.name).toBe("alice_profile.jpg");
    expect(report.whitelistPeople[0]?.whitelistKey).toBe(listKey);
    expect(report.whitelistPeople[1]?.name).toBe("bob_id.jpg");
    expect(report.whitelistPeople[1]?.whitelistKey).toBe(uploadedKey);
  });

  it("reports null name for a batch without whitelistNames", () => {
    const legacyBatch = {
      id: batchId,
      name: "Legacy Batch",
      config: {},
      whitelistKeys: ["key-1", "key-2"],
      whitelistNames: {},
      whitelistDeletedAt: null,
      startedAt: new Date(),
      createdAt: new Date(),
    };

    const report = toReportResponse(legacyBatch as any, []);
    expect(report.whitelistPeople).toHaveLength(2);
    expect(report.whitelistPeople[0]?.name).toBeNull();
    expect(report.whitelistPeople[1]?.name).toBeNull();
  });

  it("snapshot survives renaming or deleting the referenced face list", async () => {
    const listKey = `lists/${userId}/${listId}/face-1.jpg`;
    const batchRow = {
      id: batchId,
      userId,
      name: "Snapshot Batch",
      config: {},
      whitelistKeys: [listKey],
      whitelistNames: { [listKey]: "Original Face Name.jpg" },
      whitelistDeletedAt: null,
      startedAt: new Date(),
      createdAt: new Date(),
    };

    // Even if the face list is modified or deleted later in the database,
    // the batch row contains its own snapshot
    const report = toReportResponse(batchRow as any, []);
    expect(report.whitelistPeople[0]?.name).toBe("Original Face Name.jpg");
  });

  it("streams the owner's whitelist face with Cache-Control: private, no-store", async () => {
    const fakeStream = new Readable({
      read() {
        this.push(Buffer.from("img-bytes"));
        this.push(null);
      },
    });

    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
      id: batchId,
      userId,
      whitelistKeys: ["uploads/list/face-1.jpg"],
    } as any);

    vi.spyOn(storage, "getObjectStream").mockResolvedValue({
      stream: fakeStream,
      contentType: "image/jpeg",
      contentLength: 9,
    });

    const headers: Record<string, string | number> = {};
    const res: any = {
      setHeader: vi.fn((k: string, v: string | number) => {
        headers[k.toLowerCase()] = v;
      }),
    };
    fakeStream.pipe = vi.fn().mockImplementation((dest) => dest);

    const req: any = {
      params: { id: batchId, n: "1" },
      authUser: { id: userId },
    };
    const next = vi.fn();

    await getBatchWhitelistPhotoHandler(req, res, next);

    expect(headers["cache-control"]).toBe("private, no-store");
    expect(headers["content-type"]).toBe("image/jpeg");
    expect(headers["content-length"]).toBe(9);
    expect(fakeStream.pipe).toHaveBeenCalledWith(res);
    expect(next).not.toHaveBeenCalled();
  });

  it("streams job original with Cache-Control: private, no-store", async () => {
    const fakeStream = new Readable({
      read() {
        this.push(Buffer.from("original-bytes"));
        this.push(null);
      },
    });

    vi.spyOn(batchService, "getJobOriginalStream").mockResolvedValue({
      stream: fakeStream,
      contentType: "image/png",
      contentLength: 14,
      filename: "test.png",
    });

    const headers: Record<string, string | number> = {};
    const res: any = {
      setHeader: vi.fn((k: string, v: string | number) => {
        headers[k.toLowerCase()] = v;
      }),
    };
    fakeStream.pipe = vi.fn().mockImplementation((dest) => dest);

    const req: any = {
      params: { id: "11111111-1111-4111-8111-111111111111" },
      authUser: { id: userId },
    };
    const next = vi.fn();

    await getJobOriginalHandler(req, res, next);

    expect(headers["cache-control"]).toBe("private, no-store");
    expect(headers["content-type"]).toBe("image/png");
    expect(headers["content-length"]).toBe(14);
    expect(fakeStream.pipe).toHaveBeenCalledWith(res);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 once the storage object is gone", async () => {
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
      id: batchId,
      userId,
      whitelistKeys: ["uploads/list/face-purged.jpg"],
    } as any);

    vi.spyOn(storage, "getObjectStream").mockResolvedValue(null);

    await expect(getBatchWhitelistStream(batchId, 1, userId)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("returns 404 for another user's batch, non-UUID id, and bad ref", async () => {
    // Another user's batch -> not found
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue(null);
    await expect(getBatchWhitelistStream(batchId, 1, otherUserId)).rejects.toMatchObject({
      status: 404,
    });

    // Non-UUID id -> 404
    await expect(getBatchWhitelistStream("not-a-valid-uuid", 1, userId)).rejects.toMatchObject({
      status: 404,
    });

    // Out-of-range ref
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
      id: batchId,
      userId,
      whitelistKeys: ["uploads/list/face-1.jpg"],
    } as any);

    // 0 is out of range (1-based)
    await expect(getBatchWhitelistStream(batchId, 0, userId)).rejects.toMatchObject({
      status: 404,
    });
    // 2 is out of range (only 1 key)
    await expect(getBatchWhitelistStream(batchId, 2, userId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("createBatchHandler receives multiple faceListIds and forwards them to createDraftBatch", async () => {
    const listId1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const listId2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const createDraftBatchSpy = vi.spyOn(batchService, "createDraftBatch").mockResolvedValue({
      id: "batch-1",
      name: "Batch 1",
      status: "DRAFT",
    } as any);

    const req: any = {
      body: {
        faceListIds: [listId1, listId2],
        name: "Multi-list Batch",
        config: "{}",
      },
      files: undefined,
      authUser: { id: userId },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    await createBatchHandler(req, res, next);

    expect(createDraftBatchSpy).toHaveBeenCalledTimes(1);
    expect(createDraftBatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        faceListIds: [listId1, listId2],
        faceListId: listId1,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rerunBatchHandler receives multiple faceListIds and forwards them to rerunBatch", async () => {
    const listId1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const listId2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const rerunBatchSpy = vi.spyOn(batchService, "rerunBatch").mockResolvedValue({
      batch: { id: "batch-rerun", name: "Rerun", status: "DRAFT" } as any,
      skipped: 0,
    });

    const req: any = {
      params: { id: batchId },
      body: {
        faceListIds: [listId1, listId2],
        name: "Rerun Multi-list Batch",
        config: "{}",
      },
      files: undefined,
      authUser: { id: userId },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    await rerunBatchHandler(req, res, next);

    expect(rerunBatchSpy).toHaveBeenCalledTimes(1);
    expect(rerunBatchSpy).toHaveBeenCalledWith(
      batchId,
      expect.objectContaining({
        faceListIds: [listId1, listId2],
        faceListId: listId1,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
