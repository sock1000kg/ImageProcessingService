import { beforeEach, describe, expect, it, vi } from "vitest";
import { rerunBatch } from "../../src/services/batch.service";
import * as jobRepository from "../../src/repositories/job.repository";
import * as messaging from "../../src/messaging";
import { storage, UPLOADS_BUCKET } from "../../src/storage";
import { JobStatus } from "../../src/generated/prisma/client";
import { rerunBatchHandler } from "../../src/controllers/batches.controller";

describe("Batch Rerun Unit Tests (Task 38)", () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const otherUserId = "987e6543-e21b-42d3-a456-426614174999";
  const sourceBatchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validSourceBatch = {
    id: sourceBatchId,
    userId,
    name: "Source Batch",
    config: { targets: ["face"], style: "blur", strength: 25, quality: "high", format: "original" },
    whitelistKeys: [`${sourceBatchId}/whitelist/face-1.jpg`],
    whitelistDeletedAt: new Date("2026-11-04T12:00:00Z"),
    startedAt: new Date("2026-11-04T10:00:00Z"),
    createdAt: new Date("2026-11-04T09:00:00Z"),
  };

  it("copies one object per distinct input with new §5 keys and follows new format for outputKey", async () => {
    // 3 jobs in source batch, but job 1 and job 2 share the same inputKey (retry job)
    const sourceJobs = [
      {
        id: "source-job-1",
        batchId: sourceBatchId,
        originalFilename: "photo1.jpg",
        inputKey: `${sourceBatchId}/source-job-1/input.jpg`,
        outputKey: `${sourceBatchId}/source-job-1/result.jpg`,
        inputBytes: 1234,
        status: JobStatus.FAILED,
        createdAt: new Date("2026-11-04T10:01:00Z"),
      },
      {
        id: "source-job-2",
        batchId: sourceBatchId,
        originalFilename: "photo1.jpg",
        inputKey: `${sourceBatchId}/source-job-1/input.jpg`, // same inputKey!
        outputKey: `${sourceBatchId}/source-job-2/result.jpg`,
        inputBytes: 1234,
        status: JobStatus.COMPLETED,
        createdAt: new Date("2026-11-04T10:05:00Z"),
      },
      {
        id: "source-job-3",
        batchId: sourceBatchId,
        originalFilename: "photo2.jpeg",
        inputKey: `${sourceBatchId}/source-job-3/input.jpeg`,
        outputKey: `${sourceBatchId}/source-job-3/result.jpg`,
        inputBytes: 5678,
        status: JobStatus.COMPLETED,
        createdAt: new Date("2026-11-04T10:02:00Z"),
      },
    ];

    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockImplementation(async (bId: string) => {
      if (bId === sourceBatchId) return validSourceBatch as any;
      return {
        id: bId,
        userId,
        name: `${validSourceBatch.name} (re-run)`,
        config: { targets: ["face"], style: "pixelate", format: "png" },
        whitelistKeys: [],
        startedAt: null,
        createdAt: new Date(),
      } as any;
    });
    vi.spyOn(storage, "objectExists").mockResolvedValue(true);
    const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
    vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);

    let createdBatchId = "";
    vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data: any) => {
      createdBatchId = data.id;
      return {
        ...data,
        createdAt: new Date(),
        startedAt: null,
        whitelistDeletedAt: null,
      };
    });

    vi.spyOn(jobRepository, "getJobsByBatchId").mockImplementation(async (bId: string) => {
      if (bId === sourceBatchId) return sourceJobs as any;
      return addedJobs as any;
    });

    const addedJobs: any[] = [];
    vi.spyOn(jobRepository, "addJobToBatchWithLock").mockImplementation(async (bId: string, jobData: any) => {
      addedJobs.push({
        ...jobData,
        batchId: bId,
        status: JobStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return addedJobs[addedJobs.length - 1];
    });

    vi.spyOn(jobRepository, "setBatchStarted").mockResolvedValue(undefined);
    vi.spyOn(jobRepository, "getPendingJobsByBatchId").mockImplementation(async () => addedJobs);
    vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue({} as any);
    const publishSpy = vi.spyOn(messaging, "publishJob").mockResolvedValue(undefined);
    vi.spyOn(jobRepository, "getBatch").mockImplementation(async (bId: string) => {
      return {
        id: bId,
        userId,
        name: `${validSourceBatch.name} (re-run)`,
        config: { targets: ["face"], style: "pixelate", format: "png" },
        whitelistKeys: [],
        startedAt: null,
        createdAt: new Date(),
      } as any;
    });

    const result = await rerunBatch(sourceBatchId, {
      rawConfig: JSON.stringify({ targets: ["face"], style: "pixelate", format: "png" }),
      userId,
    });

    expect(result.skipped).toBe(0);
    expect(result.batch.status).toBe("DRAFT");
    // Distinct inputs: photo1 and photo2 -> exactly 2 copies
    expect(copySpy).toHaveBeenCalledTimes(2);
    expect(addedJobs).toHaveLength(2);

    // Verify copy destination paths adhere to contract §5
    for (const call of copySpy.mock.calls) {
      expect(call[0]).toBe(UPLOADS_BUCKET);
      expect(call[2]).toMatch(new RegExp(`^${createdBatchId}/[^/]+/input\\.(jpg|jpeg)$`));
    }

    // Verify outputKey uses new format (.png)
    for (const job of addedJobs) {
      expect(job.outputKey).toMatch(new RegExp(`^${createdBatchId}/[^/]+/result\\.png$`));
    }

    // Verify draft batch is not started yet (jobs not published yet)
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("handles fresh whitelist files under the new batch id without reusing old keys", async () => {
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue(validSourceBatch as any);
    vi.spyOn(storage, "objectExists").mockResolvedValue(true);
    vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
    const putObjectSpy = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);

    let createdBatchId = "";
    vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data: any) => {
      createdBatchId = data.id;
      return {
        ...data,
        createdAt: new Date(),
        startedAt: null,
        whitelistDeletedAt: null,
      };
    });

    vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([
      {
        id: "job-1",
        batchId: sourceBatchId,
        originalFilename: "image.png",
        inputKey: `${sourceBatchId}/job-1/input.png`,
        outputKey: `${sourceBatchId}/job-1/result.png`,
        inputBytes: 100,
        status: JobStatus.COMPLETED,
        createdAt: new Date(),
      },
    ] as any);

    vi.spyOn(jobRepository, "addJobToBatchWithLock").mockResolvedValue({} as any);
    vi.spyOn(jobRepository, "setBatchStarted").mockResolvedValue(undefined);
    vi.spyOn(jobRepository, "getPendingJobsByBatchId").mockResolvedValue([
      {
        id: "new-job-1",
        batchId: "dummy",
        originalFilename: "image.png",
        inputKey: "dummy-in",
        outputKey: "dummy-out",
        status: JobStatus.PENDING,
      },
    ] as any);
    vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue({} as any);
    vi.spyOn(messaging, "publishJob").mockResolvedValue(undefined);
    vi.spyOn(jobRepository, "getBatch").mockImplementation(
      async (bId: string) =>
        ({
          id: bId,
          userId,
          name: "New",
          config: { targets: ["face"] },
          whitelistKeys: [`${bId}/whitelist/face-1.png`],
          startedAt: null,
          createdAt: new Date(),
        }) as any,
    );

    const mockWhitelistFile: Express.Multer.File = {
      fieldname: "whitelist",
      originalname: "my-face.png",
      encoding: "7bit",
      mimetype: "image/png",
      size: 1024,
      buffer: Buffer.from("whitelist-image"),
      destination: "",
      filename: "",
      path: "",
      stream: null as any,
    };

    await rerunBatch(sourceBatchId, {
      whitelist: [mockWhitelistFile],
      rawConfig: { targets: ["face"] },
      userId,
    });

    expect(putObjectSpy).toHaveBeenCalledWith(
      UPLOADS_BUCKET,
      `${createdBatchId}/whitelist/face-1.png`,
      mockWhitelistFile.buffer,
      "image/png",
    );
  });

  it("throws 404 NOT_FOUND when source batch belongs to another user", async () => {
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue(null);

    await expect(
      rerunBatch(sourceBatchId, {
        rawConfig: { targets: ["face"] },
        userId: otherUserId,
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Batch not found",
    });
  });

  it("throws 409 BATCH_NOT_STARTED when source batch is still a draft", async () => {
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
      ...validSourceBatch,
      startedAt: null,
    } as any);

    await expect(
      rerunBatch(sourceBatchId, {
        rawConfig: { targets: ["face"] },
        userId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "BATCH_NOT_STARTED",
      message: "Source batch has not been started",
    });
  });

  it("throws 410 NO_ORIGINALS and removes the new draft if all originals are missing in MinIO", async () => {
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue(validSourceBatch as any);
    // objectExists returns false -> all originals missing
    vi.spyOn(storage, "objectExists").mockResolvedValue(false);
    const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);
    const deleteRowSpy = vi.spyOn(jobRepository, "deleteBatchRowOwnedByUser").mockResolvedValue(true);

    let draftId = "";
    vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data: any) => {
      draftId = data.id;
      return {
        ...data,
        createdAt: new Date(),
        startedAt: null,
        whitelistDeletedAt: null,
      };
    });

    vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([
      {
        id: "source-job-1",
        batchId: sourceBatchId,
        originalFilename: "missing.jpg",
        inputKey: `${sourceBatchId}/source-job-1/input.jpg`,
        outputKey: `${sourceBatchId}/source-job-1/result.jpg`,
        inputBytes: 1234,
        status: JobStatus.COMPLETED,
        createdAt: new Date(),
      },
    ] as any);

    await expect(
      rerunBatch(sourceBatchId, {
        rawConfig: { targets: ["face"] },
        userId,
      }),
    ).rejects.toMatchObject({
      status: 410,
      code: "NO_ORIGINALS",
    });

    // Verify draft was deleted
    expect(deletePrefixSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, `${draftId}/`);
    expect(deleteRowSpy).toHaveBeenCalledWith(draftId, userId);
  });

  it("returns skipped count when some originals are missing", async () => {
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockImplementation(async (bId: string) => {
      if (bId === sourceBatchId) return validSourceBatch as any;
      return {
        id: bId,
        userId,
        name: "Source Batch (re-run)",
        config: { targets: ["face"], style: "blur" },
        whitelistKeys: [],
        startedAt: null,
        createdAt: new Date(),
      } as any;
    });
    // 2 distinct jobs: first exists, second does not
    const sourceJobs = [
      {
        id: "job-1",
        batchId: sourceBatchId,
        originalFilename: "photo1.jpg",
        inputKey: `${sourceBatchId}/job-1/input.jpg`,
        outputKey: `${sourceBatchId}/job-1/result.jpg`,
        inputBytes: 100,
        status: JobStatus.COMPLETED,
        createdAt: new Date(),
      },
      {
        id: "job-2",
        batchId: sourceBatchId,
        originalFilename: "photo2.jpg",
        inputKey: `${sourceBatchId}/job-2/input.jpg`,
        outputKey: `${sourceBatchId}/job-2/result.jpg`,
        inputBytes: 200,
        status: JobStatus.COMPLETED,
        createdAt: new Date(),
      },
    ];

    vi.spyOn(storage, "objectExists").mockImplementation(async (_bucket, key) => {
      return key.includes("job-1");
    });
    vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
    vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);

    vi.spyOn(jobRepository, "createDraftBatch").mockResolvedValue({
      id: "new-batch-id",
      userId,
      name: "Source Batch (re-run)",
      config: { targets: ["face"], style: "blur" },
      whitelistKeys: [],
      createdAt: new Date(),
      startedAt: null,
      whitelistDeletedAt: null,
    } as any);

    vi.spyOn(jobRepository, "getJobsByBatchId").mockImplementation(async (bId: string) => {
      if (bId === sourceBatchId) return sourceJobs as any;
      return [
        {
          id: "new-job-1",
          batchId: "new-batch-id",
          originalFilename: "photo1.jpg",
          inputKey: "new-batch-id/j1/input.jpg",
          outputKey: "new-batch-id/j1/result.jpg",
          status: JobStatus.PENDING,
        },
      ] as any;
    });

    vi.spyOn(jobRepository, "addJobToBatchWithLock").mockResolvedValue({} as any);
    vi.spyOn(jobRepository, "setBatchStarted").mockResolvedValue(undefined);
    vi.spyOn(jobRepository, "getPendingJobsByBatchId").mockResolvedValue([
      { id: "new-job-1", batchId: "new-batch-id", inputKey: "k", outputKey: "out" },
    ] as any);
    vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue({} as any);
    vi.spyOn(messaging, "publishJob").mockResolvedValue(undefined);
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
      id: "new-batch-id",
      userId,
      name: "Source Batch (re-run)",
      config: { targets: ["face"], style: "blur" },
      whitelistKeys: [],
      startedAt: null,
      createdAt: new Date(),
    } as any);

    const result = await rerunBatch(sourceBatchId, {
      rawConfig: { targets: ["face"] },
      userId,
    });

    expect(result.skipped).toBe(1);
    expect(result.batch.id).toBe("new-batch-id");
  });

  it("reruns a batch whose jobs all failed successfully", async () => {
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue(validSourceBatch as any);
    const failedJobs = [
      {
        id: "source-job-1",
        batchId: sourceBatchId,
        originalFilename: "fail1.jpg",
        inputKey: `${sourceBatchId}/fail1/input.jpg`,
        outputKey: `${sourceBatchId}/fail1/result.jpg`,
        inputBytes: 1000,
        status: JobStatus.FAILED,
        createdAt: new Date("2026-11-04T10:01:00Z"),
      },
      {
        id: "source-job-2",
        batchId: sourceBatchId,
        originalFilename: "fail2.jpg",
        inputKey: `${sourceBatchId}/fail2/input.jpg`,
        outputKey: `${sourceBatchId}/fail2/result.jpg`,
        inputBytes: 2000,
        status: JobStatus.FAILED,
        createdAt: new Date("2026-11-04T10:02:00Z"),
      },
    ];
    vi.spyOn(jobRepository, "getJobsByBatchId").mockImplementation(async (bId: string) => {
      if (bId === sourceBatchId) return failedJobs as any;
      return [
        {
          id: "new-j1",
          batchId: "rerun-failed-batch-id",
          status: JobStatus.PENDING,
          originalFilename: "fail1.jpg",
          inputKey: "rerun-failed-batch-id/j1/input.jpg",
          outputKey: "rerun-failed-batch-id/j1/result.jpg",
        },
        {
          id: "new-j2",
          batchId: "rerun-failed-batch-id",
          status: JobStatus.PENDING,
          originalFilename: "fail2.jpg",
          inputKey: "rerun-failed-batch-id/j2/input.jpg",
          outputKey: "rerun-failed-batch-id/j2/result.jpg",
        },
      ] as any;
    });
    vi.spyOn(storage, "objectExists").mockResolvedValue(true);
    vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
    vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);
    vi.spyOn(jobRepository, "createDraftBatch").mockResolvedValue({
      id: "rerun-failed-batch-id",
      userId,
      name: "Source Batch (re-run)",
      config: { targets: ["face"], style: "blur" },
      whitelistKeys: [],
      createdAt: new Date(),
    } as any);
    vi.spyOn(jobRepository, "addJobToBatchWithLock").mockResolvedValue({} as any);
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
      id: "rerun-failed-batch-id",
      userId,
      name: "Source Batch (re-run)",
      config: { targets: ["face"], style: "blur" },
      whitelistKeys: [],
      startedAt: null,
      createdAt: new Date(),
    } as any);

    const result = await rerunBatch(sourceBatchId, {
      userId,
    });

    expect(result.skipped).toBe(0);
    expect(result.batch.id).toBe("rerun-failed-batch-id");
    expect(result.batch.name).toBe("Source Batch (re-run)");
    expect(storage.copyObject).toHaveBeenCalledTimes(2);
  });

  it("handles rerunBatchHandler controller request and returns 201", async () => {
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockImplementation(async (bId: string) => {
      if (bId === sourceBatchId) return validSourceBatch as any;
      return {
        id: bId,
        userId,
        name: "Custom Rerun Name",
        config: { targets: ["face"] },
        whitelistKeys: [],
        startedAt: null,
        createdAt: new Date(),
      } as any;
    });
    vi.spyOn(storage, "objectExists").mockResolvedValue(true);
    vi.spyOn(storage, "copyObject").mockResolvedValue(undefined);
    vi.spyOn(storage, "deletePrefix").mockResolvedValue(undefined);

    vi.spyOn(jobRepository, "createDraftBatch").mockResolvedValue({
      id: "new-batch-id",
      userId,
      name: "Custom Rerun Name",
      config: { targets: ["face"] },
      whitelistKeys: [],
      createdAt: new Date(),
      startedAt: null,
      whitelistDeletedAt: null,
    } as any);

    vi.spyOn(jobRepository, "getJobsByBatchId").mockImplementation(async (bId: string) => {
      if (bId === sourceBatchId) {
        return [
          {
            id: "j1",
            batchId: sourceBatchId,
            originalFilename: "pic.jpg",
            inputKey: "k1",
            outputKey: "o1",
            status: JobStatus.COMPLETED,
          },
        ] as any;
      }
      return [
        {
          id: "new-j1",
          batchId: "new-batch-id",
          originalFilename: "pic.jpg",
          inputKey: "new-batch-id/j1/input.jpg",
          outputKey: "new-batch-id/j1/result.jpg",
          status: JobStatus.PENDING,
        },
      ] as any;
    });

    vi.spyOn(jobRepository, "addJobToBatchWithLock").mockResolvedValue({} as any);
    vi.spyOn(jobRepository, "setBatchStarted").mockResolvedValue(undefined);
    vi.spyOn(jobRepository, "getPendingJobsByBatchId").mockResolvedValue([
      { id: "new-j1", batchId: "new-batch-id", inputKey: "k", outputKey: "out" },
    ] as any);
    vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue({} as any);
    vi.spyOn(messaging, "publishJob").mockResolvedValue(undefined);
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
      id: "new-batch-id",
      userId,
      name: "Custom Rerun Name",
      config: { targets: ["face"] },
      whitelistKeys: [],
      startedAt: null,
      createdAt: new Date(),
    } as any);

    const req: any = {
      params: { id: sourceBatchId },
      body: {
        config: JSON.stringify({ targets: ["face"] }),
        name: "Custom Rerun Name",
      },
      files: {},
      authUser: { id: userId, email: "user@example.com" },
    };

    let statusCode = 0;
    let jsonBody: any = null;
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        jsonBody = body;
      },
    };
    const next = vi.fn();

    await rerunBatchHandler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusCode).toBe(201);
    expect(jsonBody).toBeDefined();
    expect(jsonBody.batch.id).toBe("new-batch-id");
    expect(jsonBody.skipped).toBe(0);
  });
});
