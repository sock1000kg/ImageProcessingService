import { PNG_BYTES } from "../helpers/image-bytes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as jobRepository from "../../src/repositories/job.repository";
import * as faceListRepository from "../../src/repositories/face-list.repository";
import { storage, UPLOADS_BUCKET } from "../../src/storage";
import * as messaging from "../../src/messaging";
import { applyJobEvent } from "../../src/services/job-events.service";
import { checkAndCleanBatchWhitelist } from "../../src/services/retention.service";
import { createDraftBatch, deleteBatchById } from "../../src/services/batch.service";
import { retryFailedJob } from "../../src/services/job.service";
import { JobStatus } from "../../src/generated/prisma/client";
import { prisma } from "../../src/db/prisma";

describe("Task 53: Batches use allow-list photos directly; retry warns when faces are gone", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const listId = "22222222-2222-4222-8222-222222222222";
  const batchId = "33333333-3333-4333-8333-333333333333";
  const jobId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. a batch with a list stores the list's keys and writes nothing to storage for them", async () => {
    const listKeys = [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.png`];
    vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
      id: listId,
      userId,
      name: "Team",
      keys: listKeys,
      createdAt: new Date(),
    } as any);

    const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue();
    const putSpy = vi.spyOn(storage, "putObject").mockResolvedValue();
    const createBatchSpy = vi.spyOn(jobRepository, "createDraftBatch").mockImplementation(async (data: any) => ({
      ...data,
      startedAt: null,
      createdAt: new Date(),
      whitelistDeletedAt: null,
    }));

    const batch = await createDraftBatch({
      userId,
      faceListIds: [listId],
      rawConfig: { targets: ["face"] },
    });

    expect(copySpy).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    expect(createBatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        whitelistKeys: listKeys,
      }),
    );
    expect(batch.whitelistKeys).toEqual(listKeys);
  });

  it("2. finishing a batch, deleting a batch and a failed batch creation leave list objects untouched while uploaded faces go", async () => {
    const listKey = `lists/${userId}/${listId}/face-1.jpg`;
    const uploadedKey = `${batchId}/whitelist/face-1.jpg`;
    const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue();

    // 2a. Finishing a batch -> checkAndCleanBatchWhitelist
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
      id: batchId,
      userId,
      startedAt: new Date(),
      whitelistDeletedAt: null,
      whitelistKeys: [listKey, uploadedKey],
    } as any);
    vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([{ id: jobId, status: JobStatus.COMPLETED } as any]);
    vi.spyOn(jobRepository, "markBatchWhitelistDeleted").mockResolvedValue(undefined as any);

    await checkAndCleanBatchWhitelist(batchId);

    // Only batch's whitelist prefix is purged, never lists/
    expect(deletePrefixSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, `${batchId}/whitelist/`);
    expect(deletePrefixSpy).not.toHaveBeenCalledWith(UPLOADS_BUCKET, expect.stringContaining("lists/"));

    deletePrefixSpy.mockClear();

    // 2b. Deleting a batch -> deleteBatchById
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
      id: batchId,
      userId,
    } as any);
    vi.spyOn(prisma.uploadSession, "findMany").mockResolvedValue([]);
    vi.spyOn(jobRepository, "batchHasActiveJobs").mockResolvedValue(false);
    vi.spyOn(jobRepository, "deleteBatchRowOwnedByUser").mockResolvedValue(true);

    await deleteBatchById(batchId, userId);

    expect(deletePrefixSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, `${batchId}/`);
    expect(deletePrefixSpy).not.toHaveBeenCalledWith(UPLOADS_BUCKET, expect.stringContaining("lists/"));

    deletePrefixSpy.mockClear();

    // 2c. Failed batch creation -> rollback in createDraftBatch
    vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
      id: listId,
      userId,
      name: "Team",
      keys: [listKey],
      createdAt: new Date(),
    } as any);
    vi.spyOn(storage, "putObject").mockResolvedValue();
    vi.spyOn(jobRepository, "createDraftBatch").mockRejectedValue(new Error("DB failure"));

    const mockFile: Express.Multer.File = {
      fieldname: "whitelist",
      originalname: "face.jpg",
      encoding: "7bit",
      mimetype: "image/jpeg",
      buffer: PNG_BYTES,
      size: 4,
    } as any;

    await expect(
      createDraftBatch({
        userId,
        faceListIds: [listId],
        whitelist: [mockFile],
        rawConfig: { targets: ["face"] },
      }),
    ).rejects.toThrow("DB failure");

    expect(deletePrefixSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, expect.stringMatching(/\/whitelist\/$/));
    expect(deletePrefixSpy).not.toHaveBeenCalledWith(UPLOADS_BUCKET, expect.stringContaining("lists/"));
  });

  it("3. retry with all faces present sends them all and needs no flag", async () => {
    const listKey = `lists/${userId}/${listId}/face-1.jpg`;
    const uploadedKey = `${batchId}/whitelist/face-1.jpg`;

    const failedJob = {
      id: jobId,
      batchId,
      status: JobStatus.FAILED,
      originalFilename: "input.jpg",
      inputKey: `${batchId}/${jobId}/input.jpg`,
      outputKey: `${batchId}/${jobId}/result.jpg`,
      inputBytes: 1234,
      whitelistRefs: [],
    };

    const batch = {
      id: batchId,
      config: { targets: ["face"], style: "blur", strength: 10, quality: "high", format: "original" },
      whitelistKeys: [listKey, uploadedKey],
      whitelistDeletedAt: null,
      startedAt: new Date(),
    };

    vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(failedJob as any);
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue(batch as any);
    vi.spyOn(jobRepository, "getActiveRetryJob").mockResolvedValue(null);
    vi.spyOn(storage, "objectExists").mockResolvedValue(true); // all exist

    const insertRetrySpy = vi.spyOn(jobRepository, "insertRetryJob").mockResolvedValue({} as any);
    const publishSpy = vi.spyOn(messaging, "publishJob").mockResolvedValue();
    vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
    vi.spyOn(jobRepository, "getJob").mockResolvedValue({ ...failedJob, id: "retry-1" } as any);

    const result = await retryFailedJob(jobId, userId);
    expect(result.id).toBe("retry-1");

    // Whitelist refs is empty since all faces are present and unchanged
    expect(insertRetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        whitelistRefs: [],
      }),
    );

    // Command carries both keys
    expect(publishSpy).toHaveBeenCalledWith(
      "jobs.image",
      expect.objectContaining({
        params: expect.objectContaining({
          whitelist: expect.objectContaining({
            faces: [
              { bucket: "uploads", key: listKey },
              { bucket: "uploads", key: uploadedKey },
            ],
          }),
        }),
      }),
    );
  });

  it("4. list + uploads after finish -> 409 without the flag and no job created, with the flag -> a job whose command carries only the list's keys", async () => {
    const listKey = `lists/${userId}/${listId}/face-1.jpg`;
    const uploadedKey = `${batchId}/whitelist/face-1.jpg`;

    const failedJob = {
      id: jobId,
      batchId,
      status: JobStatus.FAILED,
      originalFilename: "input.jpg",
      inputKey: `${batchId}/${jobId}/input.jpg`,
      outputKey: `${batchId}/${jobId}/result.jpg`,
      inputBytes: 1234,
      whitelistRefs: [],
    };

    const batch = {
      id: batchId,
      config: { targets: ["face"], style: "blur", quality: "high", format: "original" },
      whitelistKeys: [listKey, uploadedKey],
      whitelistDeletedAt: new Date(), // Batch finished, uploaded copy purged
      startedAt: new Date(),
    };

    vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(failedJob as any);
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue(batch as any);
    vi.spyOn(jobRepository, "getActiveRetryJob").mockResolvedValue(null);

    // Input exists, list key exists, but uploaded key is gone
    vi.spyOn(storage, "objectExists").mockImplementation(async (_bucket, key) => {
      if (key === failedJob.inputKey) return true;
      if (key === listKey) return true;
      return false; // uploadedKey is gone
    });

    const insertRetrySpy = vi.spyOn(jobRepository, "insertRetryJob").mockResolvedValue({} as any);
    const publishSpy = vi.spyOn(messaging, "publishJob").mockResolvedValue();
    vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
    vi.spyOn(jobRepository, "getJob").mockResolvedValue({ ...failedJob, id: "retry-2" } as any);

    // 4a. Without flag: throws 409 WHITELIST_FACES_MISSING with details, no job created
    await expect(retryFailedJob(jobId, userId)).rejects.toMatchObject({
      status: 409,
      code: "WHITELIST_FACES_MISSING",
      details: { missing: 1, total: 2 },
    });
    expect(insertRetrySpy).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();

    // 4b. With flag: creates job carrying only surviving list key
    const retryResult = await retryFailedJob(jobId, userId, { acceptMissingFaces: true });
    expect(retryResult.id).toBe("retry-2");

    expect(insertRetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        whitelistRefs: [0], // index of listKey in batch.whitelistKeys [listKey, uploadedKey]
      }),
    );

    expect(publishSpy).toHaveBeenCalledWith(
      "jobs.image",
      expect.objectContaining({
        params: expect.objectContaining({
          whitelist: expect.objectContaining({
            faces: [{ bucket: "uploads", key: listKey }],
          }),
        }),
      }),
    );
  });

  it("5. deleted list -> same (409 without flag, with flag -> command carries remaining keys or empty)", async () => {
    const listKey = `lists/${userId}/${listId}/face-1.jpg`;

    const failedJob = {
      id: jobId,
      batchId,
      status: JobStatus.FAILED,
      originalFilename: "input.jpg",
      inputKey: `${batchId}/${jobId}/input.jpg`,
      outputKey: `${batchId}/${jobId}/result.jpg`,
      inputBytes: 1234,
      whitelistRefs: [],
    };

    const batch = {
      id: batchId,
      config: { targets: ["face"], style: "blur", quality: "high", format: "original" },
      whitelistKeys: [listKey],
      whitelistDeletedAt: null,
      startedAt: new Date(),
    };

    vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(failedJob as any);
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue(batch as any);
    vi.spyOn(jobRepository, "getActiveRetryJob").mockResolvedValue(null);

    // List was deleted: listKey does not exist
    vi.spyOn(storage, "objectExists").mockImplementation(async (_bucket, key) => {
      if (key === failedJob.inputKey) return true;
      return false;
    });

    const insertRetrySpy = vi.spyOn(jobRepository, "insertRetryJob").mockResolvedValue({} as any);
    const publishSpy = vi.spyOn(messaging, "publishJob").mockResolvedValue();
    vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
    vi.spyOn(jobRepository, "getJob").mockResolvedValue({ ...failedJob, id: "retry-3" } as any);

    // Without flag -> 409
    await expect(retryFailedJob(jobId, userId)).rejects.toMatchObject({
      status: 409,
      code: "WHITELIST_FACES_MISSING",
      details: { missing: 1, total: 1 },
    });
    expect(insertRetrySpy).not.toHaveBeenCalled();

    // With flag -> succeeds, no whitelist sent (everyone blurred)
    const result = await retryFailedJob(jobId, userId, { acceptMissingFaces: true });
    expect(result.id).toBe("retry-3");

    expect(insertRetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        whitelistRefs: [],
      }),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      "jobs.image",
      expect.objectContaining({
        params: expect.not.objectContaining({
          whitelist: expect.anything(),
        }),
      }),
    );
  });

  it("6. a whitelistRef from a subset retry is stored as the batch-level index, so the report attributes the right person, and a duplicate COMPLETED doesn't change it", async () => {
    // Suppose batch originally had keys [A, B, C] at indices 0, 1, 2
    // A was deleted, so only [B, C] were sent to worker.
    // The retry job has whitelistRefs: [1, 2]
    const retryJobRecord = {
      id: jobId,
      batchId,
      status: JobStatus.PROCESSING,
      progress: 50,
      stage: "PROCESSING",
      outputKey: `${batchId}/${jobId}/result.jpg`,
      resultSummary: null,
      error: null,
      whitelistRefs: [1, 2], // worker face 0 -> batch index 1, worker face 1 -> batch index 2
    };

    vi.spyOn(jobRepository, "getJob").mockResolvedValue(retryJobRecord as any);
    const updateJobSpy = vi.spyOn(jobRepository, "updateJobState").mockResolvedValue();
    vi.spyOn(storage, "statObject").mockResolvedValue(5678);

    const completedEvent = {
      jobId,
      status: "COMPLETED" as const,
      progress: 100,
      stage: "DONE",
      result: { bucket: "results", key: `${batchId}/${jobId}/result.jpg` },
      resultSummary: {
        counts: { face: 2, whitelistedFace: 2 },
        detections: [
          {
            label: "face",
            confidence: 0.95,
            box: [10, 10, 50, 50] as [number, number, number, number],
            redacted: false,
            whitelisted: true,
            whitelistRef: 0, // worker index 0 (which is batch face B, index 1)
          },
          {
            label: "face",
            confidence: 0.91,
            box: [60, 60, 90, 90] as [number, number, number, number],
            redacted: false,
            whitelisted: true,
            whitelistRef: 1, // worker index 1 (which is batch face C, index 2)
          },
        ],
      },
    };

    // First completion
    await applyJobEvent(completedEvent);

    expect(updateJobSpy).toHaveBeenCalledTimes(1);
    const firstCallArgs = updateJobSpy.mock.calls[0][1];
    expect(firstCallArgs.status).toBe(JobStatus.COMPLETED);

    const detections = (firstCallArgs.resultSummary as any).detections;
    expect(detections[0].whitelistRef).toBe(1); // translated 0 -> 1
    expect(detections[1].whitelistRef).toBe(2); // translated 1 -> 2

    // Now simulate duplicate COMPLETED event delivery
    // The DB now holds the completed record with translated summary
    vi.spyOn(jobRepository, "getJob").mockResolvedValue({
      ...retryJobRecord,
      status: JobStatus.COMPLETED,
      progress: 100,
      stage: "DONE",
      resultSummary: firstCallArgs.resultSummary,
      resultBytes: 5678,
    } as any);

    await applyJobEvent(completedEvent);

    // calculateNextJobState returns current state on duplicate terminal event,
    // so detections still have whitelistRef 1 and 2 (never translated to undefined or out of range)
    const secondCallArgs = updateJobSpy.mock.calls[1][1];
    const secondDetections = (secondCallArgs.resultSummary as any).detections;
    expect(secondDetections[0].whitelistRef).toBe(1);
    expect(secondDetections[1].whitelistRef).toBe(2);
  });

  it("7. batches without a whitelist are unaffected", async () => {
    const failedJob = {
      id: jobId,
      batchId,
      status: JobStatus.FAILED,
      originalFilename: "input.jpg",
      inputKey: `${batchId}/${jobId}/input.jpg`,
      outputKey: `${batchId}/${jobId}/result.jpg`,
      inputBytes: 1234,
      whitelistRefs: [],
    };

    const batch = {
      id: batchId,
      config: { targets: ["face"], style: "blur", quality: "high", format: "original" },
      whitelistKeys: [], // no whitelist
      whitelistDeletedAt: null,
      startedAt: new Date(),
    };

    vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(failedJob as any);
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue(batch as any);
    vi.spyOn(jobRepository, "getActiveRetryJob").mockResolvedValue(null);
    vi.spyOn(storage, "objectExists").mockResolvedValue(true);

    const insertRetrySpy = vi.spyOn(jobRepository, "insertRetryJob").mockResolvedValue({} as any);
    const publishSpy = vi.spyOn(messaging, "publishJob").mockResolvedValue();
    vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
    vi.spyOn(jobRepository, "getJob").mockResolvedValue({ ...failedJob, id: "retry-plain" } as any);

    const result = await retryFailedJob(jobId, userId);
    expect(result.id).toBe("retry-plain");

    expect(insertRetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        whitelistRefs: [],
      }),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      "jobs.image",
      expect.objectContaining({
        params: expect.not.objectContaining({
          whitelist: expect.anything(),
        }),
      }),
    );
  });
});
