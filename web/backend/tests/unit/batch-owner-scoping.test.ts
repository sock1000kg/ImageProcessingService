import { PNG_BYTES } from "../helpers/image-bytes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addBatchFile,
  deleteBatchById,
  getBatchById,
  getBatchReportById,
  renameBatch,
  rerunBatch,
  startBatch,
} from "../../src/services/batch.service";
import { getJobById, retryFailedJob } from "../../src/services/job.service";
import * as jobRepository from "../../src/repositories/job.repository";

describe("Batch and Job Owner Scoping Unit Tests (Task 90)", () => {
  const ownerUserId = "11111111-1111-4111-8111-111111111111";
  const otherUserId = "22222222-2222-4222-8222-222222222222";
  const batchId = "33333333-3333-4333-8333-333333333333";
  const jobId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.restoreAllMocks();
    // Simulate that queries scoped to otherUserId return null (not found for other user)
    vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([]);
    vi.spyOn(jobRepository, "getBatchOwnedByUser").mockImplementation(async (bId, uId) => {
      if (bId === batchId && uId === ownerUserId) {
        return {
          id: batchId,
          userId: ownerUserId,
          name: "Owner Batch",
          config: {},
          whitelistKeys: [],
          whitelistDeletedAt: null,
          startedAt: new Date(),
          createdAt: new Date(),
        } as any;
      }
      return null;
    });

    vi.spyOn(jobRepository, "getJobOwnedByUser").mockImplementation(async (jId, uId) => {
      if (jId === jobId && uId === ownerUserId) {
        return {
          id: jobId,
          batchId,
          originalFilename: "photo.jpg",
          inputKey: `${batchId}/${jobId}/input.jpg`,
          outputKey: `${batchId}/${jobId}/result.jpg`,
          status: "COMPLETED",
          progress: 100,
          stage: "DONE",
          resultSummary: null,
          error: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
      }
      return null;
    });
  });

  it("another user's batch and job return null/404 through the services", async () => {
    // 1. getBatchById returns null when scoped to another user
    const batchForOtherUser = await getBatchById(batchId, otherUserId);
    expect(batchForOtherUser).toBeNull();

    // Owner can see it
    const batchForOwner = await getBatchById(batchId, ownerUserId);
    expect(batchForOwner).not.toBeNull();
    expect(batchForOwner?.id).toBe(batchId);

    // 2. getJobById returns null when scoped to another user
    const jobForOtherUser = await getJobById(jobId, otherUserId);
    expect(jobForOtherUser).toBeNull();

    // Owner can see it
    const jobForOwner = await getJobById(jobId, ownerUserId);
    expect(jobForOwner).not.toBeNull();
    expect(jobForOwner?.id).toBe(jobId);

    // 3. addBatchFile throws 404 NOT_FOUND for another user
    const dummyFile: Express.Multer.File = {
      fieldname: "file",
      originalname: "test.jpg",
      encoding: "7bit",
      mimetype: "image/jpeg",
      size: 100,
      buffer: PNG_BYTES,
      stream: null as any,
      destination: "",
      filename: "",
      path: "",
    };
    await expect(addBatchFile(batchId, dummyFile, otherUserId)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Batch not found",
    });

    // 4. startBatch throws 404 NOT_FOUND for another user
    await expect(startBatch(batchId, otherUserId)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Batch not found",
    });

    // 5. renameBatch throws 404 NOT_FOUND for another user
    await expect(renameBatch(batchId, "New Name", otherUserId)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Batch not found",
    });

    // 6. getBatchReportById returns null for another user
    const reportForOtherUser = await getBatchReportById(batchId, otherUserId);
    expect(reportForOtherUser).toBeNull();

    // 7. deleteBatchById returns false for another user
    const deletedForOtherUser = await deleteBatchById(batchId, otherUserId);
    expect(deletedForOtherUser).toBe(false);

    // 8. rerunBatch throws 404 NOT_FOUND for another user
    await expect(
      rerunBatch(batchId, {
        userId: otherUserId,
        rawConfig: {},
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Batch not found",
    });

    // 9. retryFailedJob throws 410 JOB_EXPIRED (not found for this user)
    await expect(retryFailedJob(jobId, otherUserId)).rejects.toMatchObject({
      status: 410,
      code: "JOB_EXPIRED",
    });
  });
});
