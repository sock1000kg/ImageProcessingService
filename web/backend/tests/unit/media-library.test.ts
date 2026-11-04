import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteJobById, listBatches, retryFailedJob } from "../../src/services/batch.service";
import * as jobRepository from "../../src/repositories/job.repository";
import * as messaging from "../../src/messaging";
import { storage } from "../../src/storage";
import { JobStatus } from "../../src/generated/prisma/client";
import { prisma } from "../../src/db/prisma";

describe("Media Library Backend Unit Tests (Task 36)", () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const otherUserId = "987e6543-e21b-42d3-a456-426614174999";
  const batchId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const jobId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/batches (listBatches)", () => {
    it("returns user batches with thumbnail, counts, bytes, and usage aggregate", async () => {
      const mockBatches = [
        {
          id: batchId,
          name: "Vacation Photos",
          startedAt: new Date("2026-11-04T10:00:00Z"),
          createdAt: new Date("2026-11-04T09:30:00Z"),
          jobs: [
            {
              id: "job-1",
              status: JobStatus.COMPLETED,
              inputBytes: 1500,
              resultBytes: 2500,
              resultUrl: "/results/batch/job-1/result.jpg",
              createdAt: new Date("2026-11-04T09:31:00Z"),
            },
            {
              id: "job-2",
              status: JobStatus.FAILED,
              inputBytes: 1000,
              resultBytes: null,
              resultUrl: null,
              createdAt: new Date("2026-11-04T09:32:00Z"),
            },
          ],
        },
      ];

      vi.spyOn(jobRepository, "listBatchesByUserId").mockResolvedValue(mockBatches as any);
      vi.spyOn(jobRepository, "getAccountUsage").mockResolvedValue({
        batches: 1,
        jobs: 2,
        bytes: 5000,
      });

      const result = await listBatches(userId, { limit: 20 });

      expect(result.batches).toHaveLength(1);
      const item = result.batches[0];
      expect(item.id).toBe(batchId);
      expect(item.name).toBe("Vacation Photos");
      expect(item.thumbnailUrl).toBe("/results/batch/job-1/result.jpg");
      expect(item.status).toBe("PARTIAL");
      expect(item.jobCounts).toEqual({ total: 2, completed: 1, failed: 1 });
      expect(item.bytes).toBe(5000); // 1500 + 2500 + 1000 + 0
      expect(result.nextCursor).toBeNull();
      expect(result.usage).toEqual({ batches: 1, jobs: 2, bytes: 5000 });
      expect(jobRepository.listBatchesByUserId).toHaveBeenCalledWith(userId, { limit: 20 });
    });

    it("picks null for thumbnailUrl when no jobs are COMPLETED", async () => {
      const mockBatches = [
        {
          id: batchId,
          name: "Pending Batch",
          startedAt: null,
          createdAt: new Date("2026-11-04T09:30:00Z"),
          jobs: [
            {
              id: "job-1",
              status: JobStatus.PENDING,
              inputBytes: 2000,
              resultBytes: null,
              resultUrl: null,
              createdAt: new Date("2026-11-04T09:31:00Z"),
            },
          ],
        },
      ];

      vi.spyOn(jobRepository, "listBatchesByUserId").mockResolvedValue(mockBatches as any);
      vi.spyOn(jobRepository, "getAccountUsage").mockResolvedValue({ batches: 1, jobs: 1, bytes: 2000 });

      const result = await listBatches(userId, { limit: 20 });
      expect(result.batches[0].thumbnailUrl).toBeNull();
      expect(result.batches[0].status).toBe("DRAFT");
    });

    it("handles pagination with nextCursor when more items exist", async () => {
      const mockBatches = [
        {
          id: "batch-1",
          name: "Batch 1",
          startedAt: new Date(),
          createdAt: new Date(),
          jobs: [],
        },
        {
          id: "batch-2",
          name: "Batch 2",
          startedAt: new Date(),
          createdAt: new Date(),
          jobs: [],
        },
      ];

      vi.spyOn(jobRepository, "listBatchesByUserId").mockResolvedValue(mockBatches as any);
      vi.spyOn(jobRepository, "getAccountUsage").mockResolvedValue({ batches: 2, jobs: 0, bytes: 0 });

      // Request with limit 1, received 2 items -> page has 1 item, nextCursor is batch-1
      const result = await listBatches(userId, { limit: 1 });
      expect(result.batches).toHaveLength(1);
      expect(result.batches[0].id).toBe("batch-1");
      expect(result.nextCursor).toBe("batch-1");
    });
  });

  describe("DELETE /api/jobs/:id (deleteJobById)", () => {
    it("throws 404 NOT_FOUND if job does not exist or user is not owner", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(null);

      await expect(deleteJobById(jobId, otherUserId)).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
      });
    });

    it("throws 409 JOB_ACTIVE if job status is QUEUED or PROCESSING", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        status: JobStatus.PROCESSING,
      } as any);

      await expect(deleteJobById(jobId, userId)).rejects.toMatchObject({
        status: 409,
        code: "JOB_ACTIVE",
      });

      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        status: JobStatus.QUEUED,
      } as any);

      await expect(deleteJobById(jobId, userId)).rejects.toMatchObject({
        status: 409,
        code: "JOB_ACTIVE",
      });
    });

    it("deletes input and result objects from storage and removes row", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        inputKey: `${batchId}/${jobId}/input.jpg`,
        outputKey: `${batchId}/${jobId}/result.jpg`,
        status: JobStatus.COMPLETED,
      } as any);

      const deleteObjectSpy = vi.spyOn(storage, "deleteObject").mockResolvedValue();
      vi.spyOn(jobRepository, "countJobsByBatchId").mockResolvedValue(2);
      const deleteJobSpy = vi.spyOn(jobRepository, "deleteJob").mockResolvedValue();
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
        id: batchId,
        startedAt: new Date(),
        whitelistDeletedAt: new Date(),
      } as any);

      await deleteJobById(jobId, userId);

      expect(deleteObjectSpy).toHaveBeenCalledWith("uploads", `${batchId}/${jobId}/input.jpg`);
      expect(deleteObjectSpy).toHaveBeenCalledWith("results", `${batchId}/${jobId}/result.jpg`);
      expect(deleteJobSpy).toHaveBeenCalledWith(jobId);
    });

    it("deletes entire batch if deleting the last job in the batch", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        inputKey: `${batchId}/${jobId}/input.jpg`,
        outputKey: `${batchId}/${jobId}/result.jpg`,
        status: JobStatus.COMPLETED,
      } as any);

      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({ id: batchId, userId } as any);
      vi.spyOn(storage, "deleteObject").mockResolvedValue();
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue();
      vi.spyOn(jobRepository, "countJobsByBatchId").mockResolvedValue(1);
      const deleteBatchRowSpy = vi.spyOn(jobRepository, "deleteBatchRowOwnedByUser").mockResolvedValue(true);

      await deleteJobById(jobId, userId);

      expect(deletePrefixSpy).toHaveBeenCalledWith("uploads", `${batchId}/`);
      expect(deletePrefixSpy).toHaveBeenCalledWith("results", `${batchId}/`);
      expect(deleteBatchRowSpy).toHaveBeenCalledWith(batchId, userId);
    });
  });

  describe("Retention Rules (getExpiredBatches)", () => {
    it("when retentionDays is unset, finds only draft batches older than 24h", async () => {
      const findManySpy = vi.spyOn(prisma.batch, "findMany").mockResolvedValue([{ id: "expired-draft" }] as any);

      const expired = await jobRepository.getExpiredBatches(undefined);

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startedAt: null,
            createdAt: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
        }),
      );
      expect(expired).toEqual([{ id: "expired-draft" }]);
    });

    it("when retentionDays is set, finds all batches older than N days regardless of status", async () => {
      const findManySpy = vi.spyOn(prisma.batch, "findMany").mockResolvedValue([{ id: "expired-any" }] as any);

      const expired = await jobRepository.getExpiredBatches(7);

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: expect.objectContaining({
              lt: expect.any(Date),
            }),
          },
        }),
      );
      // Notice startedAt is not present in where clause
      const whereArg = findManySpy.mock.calls[0][0]?.where as Record<string, unknown>;
      expect(whereArg).not.toHaveProperty("startedAt");
      expect(expired).toEqual([{ id: "expired-any" }]);
    });
  });

  describe("Retry after 24h (retryFailedJob)", () => {
    it("allows retry on batches older than 24h as long as input exists", async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago
      const failedJob = {
        id: jobId,
        batchId,
        originalFilename: "photo.jpg",
        inputKey: `${batchId}/${jobId}/input.jpg`,
        inputBytes: 3456,
        status: JobStatus.FAILED,
        createdAt: oldDate,
      };

      const oldBatch = {
        id: batchId,
        config: { targets: ["face"], style: "blur" },
        whitelistKeys: [],
        whitelistDeletedAt: null,
        startedAt: oldDate,
        createdAt: oldDate,
      };

      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(failedJob as any);
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(oldBatch as any);
      vi.spyOn(jobRepository, "getActiveRetryJob").mockResolvedValue(null);
      vi.spyOn(storage, "objectExists").mockResolvedValue(true);
      const insertRetrySpy = vi.spyOn(jobRepository, "insertRetryJob").mockResolvedValue({} as any);
      vi.spyOn(messaging, "publishJob").mockResolvedValue();
      vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
      vi.spyOn(jobRepository, "getJob").mockResolvedValue({
        ...failedJob,
        id: "new-retry-id",
        status: JobStatus.PENDING,
      } as any);

      const result = await retryFailedJob(jobId, userId);

      expect(result.id).toBe("new-retry-id");
      expect(insertRetrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId,
          inputKey: failedJob.inputKey,
          inputBytes: 3456,
        }),
      );
    });
  });
});
