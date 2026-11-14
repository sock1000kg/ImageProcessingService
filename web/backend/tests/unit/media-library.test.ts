import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkAndCleanBatchWhitelist,
  cleanupExpiredBatches,
  retryPendingWhitelistCleanups,
} from "../../src/services/retention.service";
import { deleteJobById, retryFailedJob } from "../../src/services/job.service";
import { deleteBatchById, listBatches } from "../../src/services/batch.service";
import * as jobRepository from "../../src/repositories/job.repository";
import * as messaging from "../../src/messaging";
import { storage, UPLOADS_BUCKET, RESULTS_BUCKET } from "../../src/storage";
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
              originalFilename: "vacation1.jpg",
              status: JobStatus.COMPLETED,
              inputBytes: 1500,
              resultBytes: 2500,
              outputKey: "batch/job-1/result.jpg",
              createdAt: new Date("2026-11-04T09:31:00Z"),
            },
            {
              id: "job-2",
              originalFilename: "vacation2.jpg",
              status: JobStatus.FAILED,
              inputBytes: 1000,
              resultBytes: null,
              outputKey: "batch/job-2/result.jpg",
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
      vi.spyOn(storage, "presignGetUrl").mockResolvedValue({
        url: "http://localhost:9000/signed-thumb.jpg",
        expiresAt: new Date().toISOString(),
      });

      const result = await listBatches(userId, { limit: 20 });

      expect(result.batches).toHaveLength(1);
      const item = result.batches[0];
      expect(item.id).toBe(batchId);
      expect(item.name).toBe("Vacation Photos");
      expect(item.thumbnailUrl).toBe("http://localhost:9000/signed-thumb.jpg");
      expect(item.hasVideo).toBe(false);
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
              outputKey: "batch/job-1/result.jpg",
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

    it("picks the first completed image result as thumbnail when first completed job is a video", async () => {
      const mockBatches = [
        {
          id: batchId,
          name: "Mixed Media Batch",
          startedAt: new Date("2026-11-04T10:00:00Z"),
          createdAt: new Date("2026-11-04T09:30:00Z"),
          jobs: [
            {
              id: "job-video",
              status: JobStatus.COMPLETED,
              originalFilename: "recording.mp4",
              inputBytes: 5000,
              resultBytes: 4500,
              outputKey: "results/batch/job-video/result.mp4",
              createdAt: new Date("2026-11-04T09:31:00Z"),
            },
            {
              id: "job-image",
              status: JobStatus.COMPLETED,
              originalFilename: "snapshot.jpg",
              inputBytes: 1500,
              resultBytes: 1200,
              outputKey: "results/batch/job-image/result.jpg",
              createdAt: new Date("2026-11-04T09:32:00Z"),
            },
          ],
        },
      ];

      vi.spyOn(jobRepository, "listBatchesByUserId").mockResolvedValue(mockBatches as any);
      vi.spyOn(jobRepository, "getAccountUsage").mockResolvedValue({ batches: 1, jobs: 2, bytes: 12200 });
      const presignSpy = vi.spyOn(storage, "presignGetUrl").mockResolvedValue({
        url: "http://localhost:9000/signed-image.jpg",
        expiresAt: new Date().toISOString(),
      });

      const result = await listBatches(userId, { limit: 20 });
      const item = result.batches[0];

      expect(item.thumbnailUrl).toBe("http://localhost:9000/signed-image.jpg");
      expect(item.hasVideo).toBe(true);
      expect(presignSpy).toHaveBeenCalledTimes(1);
      expect(presignSpy).toHaveBeenCalledWith(RESULTS_BUCKET, "results/batch/job-image/result.jpg", expect.any(Object));
      expect(presignSpy).not.toHaveBeenCalledWith(
        RESULTS_BUCKET,
        "results/batch/job-video/result.mp4",
        expect.any(Object),
      );
    });

    it("returns thumbnailUrl: null and hasVideo: true for a video-only batch without presigning the video key", async () => {
      const mockBatches = [
        {
          id: batchId,
          name: "Video Only Batch",
          startedAt: new Date("2026-11-04T10:00:00Z"),
          createdAt: new Date("2026-11-04T09:30:00Z"),
          jobs: [
            {
              id: "job-video-1",
              status: JobStatus.COMPLETED,
              originalFilename: "clip.mp4",
              inputBytes: 10000,
              resultBytes: 9500,
              outputKey: "results/batch/job-video-1/result.mp4",
              createdAt: new Date("2026-11-04T09:31:00Z"),
            },
          ],
        },
      ];

      vi.spyOn(jobRepository, "listBatchesByUserId").mockResolvedValue(mockBatches as any);
      vi.spyOn(jobRepository, "getAccountUsage").mockResolvedValue({ batches: 1, jobs: 1, bytes: 19500 });
      const presignSpy = vi.spyOn(storage, "presignGetUrl");

      const result = await listBatches(userId, { limit: 20 });
      const item = result.batches[0];

      expect(item.thumbnailUrl).toBeNull();
      expect(item.hasVideo).toBe(true);
      expect(presignSpy).not.toHaveBeenCalled();
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
      vi.spyOn(prisma.uploadSession, "findMany").mockResolvedValue([]);
      vi.spyOn(jobRepository, "batchHasActiveJobs").mockResolvedValue(false);
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue();
      vi.spyOn(jobRepository, "countJobsByBatchId").mockResolvedValue(1);
      const deleteBatchRowSpy = vi.spyOn(jobRepository, "deleteBatchRowOwnedByUser").mockResolvedValue(true);

      await deleteJobById(jobId, userId);

      expect(deletePrefixSpy).toHaveBeenCalledWith("uploads", `${batchId}/`);
      expect(deletePrefixSpy).toHaveBeenCalledWith("results", `${batchId}/`);
      expect(deleteBatchRowSpy).toHaveBeenCalledWith(batchId, userId);
    });
  });

  describe("DELETE /api/batches/:id (deleteBatchById)", () => {
    it("refuses to delete a batch while a job is queued or processing, and touches no files", async () => {
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({ id: batchId, userId } as any);
      vi.spyOn(jobRepository, "batchHasActiveJobs").mockResolvedValue(true);
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue();

      await expect(deleteBatchById(batchId, userId)).rejects.toMatchObject({ status: 409, code: "BATCH_ACTIVE" });
      expect(deletePrefixSpy).not.toHaveBeenCalled();
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

    it("when retentionDays is set, a 2-day-old draft is expired, a 2-day-old started batch isn't, and a draft under 24 hours isn't", async () => {
      const now = Date.now();
      const batches = [
        { id: "2-day-draft", startedAt: null, createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
        {
          id: "2-day-started",
          startedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
          createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
        },
        { id: "recent-draft", startedAt: null, createdAt: new Date(now - 12 * 60 * 60 * 1000) },
        {
          id: "8-day-started",
          startedAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
          createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
        },
      ];

      const findManySpy = vi.spyOn(prisma.batch, "findMany").mockImplementation(async (args: any) => {
        const where = args.where;
        const matches = (b: (typeof batches)[0]) => {
          if (where.OR) {
            return where.OR.some((cond: any) => {
              if (cond.startedAt === null && b.startedAt !== null) return false;
              if (cond.createdAt?.lt && !(b.createdAt < cond.createdAt.lt)) return false;
              return true;
            });
          }
          if (where.startedAt === null && b.startedAt !== null) return false;
          if (where.createdAt?.lt && !(b.createdAt < where.createdAt.lt)) return false;
          return true;
        };
        return batches.filter(matches).map((b) => ({ id: b.id })) as any;
      });

      const expired = await jobRepository.getExpiredBatches(7);

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ createdAt: expect.objectContaining({ lt: expect.any(Date) }) }),
              expect.objectContaining({
                startedAt: null,
                createdAt: expect.objectContaining({ lt: expect.any(Date) }),
              }),
            ]),
          }),
        }),
      );

      const expiredIds = expired.map((b) => b.id);
      expect(expiredIds).toContain("2-day-draft");
      expect(expiredIds).not.toContain("2-day-started");
      expect(expiredIds).not.toContain("recent-draft");
      expect(expiredIds).toContain("8-day-started");
    });
  });

  describe("Batch Retention Cleanup (cleanupExpiredBatches)", () => {
    it("keeps the row and does not count the batch if deletePrefix fails in either bucket", async () => {
      // 1. Uploads bucket deletePrefix fails
      vi.spyOn(jobRepository, "getExpiredBatches").mockResolvedValue([{ id: "batch-uploads-fail" }] as any);
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockImplementation(async (bucket) => {
        if (bucket === UPLOADS_BUCKET) {
          throw new Error("MinIO uploads error");
        }
      });
      const deleteBatchRowSpy = vi.spyOn(jobRepository, "deleteBatchRow").mockResolvedValue(true);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      let count = await cleanupExpiredBatches();

      expect(count).toBe(0);
      expect(deleteBatchRowSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("batch-uploads-fail"), expect.any(Error));

      // 2. Results bucket deletePrefix fails
      vi.spyOn(jobRepository, "getExpiredBatches").mockResolvedValue([{ id: "batch-results-fail" }] as any);
      deletePrefixSpy.mockImplementation(async (bucket) => {
        if (bucket === RESULTS_BUCKET) {
          throw new Error("MinIO results error");
        }
      });
      deleteBatchRowSpy.mockClear();
      consoleErrorSpy.mockClear();

      count = await cleanupExpiredBatches();

      expect(count).toBe(0);
      expect(deleteBatchRowSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("batch-results-fail"), expect.any(Error));
    });

    it("deletes and counts the batch on a following run when storage works", async () => {
      const batch = { id: "batch-retry-success" };
      vi.spyOn(jobRepository, "getExpiredBatches").mockResolvedValue([batch] as any);

      // Run 1: storage fails
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockImplementation(async (bucket) => {
        if (bucket === UPLOADS_BUCKET) throw new Error("Storage temporarily unavailable");
      });
      const deleteBatchRowSpy = vi.spyOn(jobRepository, "deleteBatchRow").mockResolvedValue(true);
      vi.spyOn(console, "error").mockImplementation(() => {});

      const firstRunCount = await cleanupExpiredBatches();
      expect(firstRunCount).toBe(0);
      expect(deleteBatchRowSpy).not.toHaveBeenCalled();

      // Run 2: storage works
      deletePrefixSpy.mockResolvedValue(undefined as any);
      deleteBatchRowSpy.mockClear();

      const secondRunCount = await cleanupExpiredBatches();
      expect(secondRunCount).toBe(1);
      expect(deleteBatchRowSpy).toHaveBeenCalledWith(batch.id);
    });

    it("does not stop another batch being deleted when one batch fails", async () => {
      const failingBatch = { id: "failing-batch" };
      const healthyBatch = { id: "healthy-batch" };
      vi.spyOn(jobRepository, "getExpiredBatches").mockResolvedValue([failingBatch, healthyBatch] as any);

      vi.spyOn(storage, "deletePrefix").mockImplementation(async (bucket, prefix) => {
        if (prefix.startsWith(`${failingBatch.id}/`)) {
          throw new Error("Storage failure for failing-batch");
        }
      });
      const deleteBatchRowSpy = vi.spyOn(jobRepository, "deleteBatchRow").mockResolvedValue(true);
      vi.spyOn(console, "error").mockImplementation(() => {});

      const count = await cleanupExpiredBatches();

      expect(count).toBe(1);
      expect(deleteBatchRowSpy).not.toHaveBeenCalledWith(failingBatch.id);
      expect(deleteBatchRowSpy).toHaveBeenCalledWith(healthyBatch.id);
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

  describe("Whitelist Cleanup Reliability (Task 83)", () => {
    it("leaves whitelistDeletedAt unset when deletePrefix fails", async () => {
      const batch = {
        id: batchId,
        startedAt: new Date("2026-11-04T10:00:00Z"),
        whitelistDeletedAt: null,
      };
      const jobs = [{ id: jobId, status: JobStatus.COMPLETED }];

      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(batch as any);
      vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue(jobs as any);
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockRejectedValue(new Error("MinIO delete failure"));
      const markDeletedSpy = vi.spyOn(jobRepository, "markBatchWhitelistDeleted").mockResolvedValue(undefined as any);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await checkAndCleanBatchWhitelist(batchId);

      expect(deletePrefixSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, `${batchId}/whitelist/`);
      expect(markDeletedSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to delete S3 whitelist objects for batch ${batchId}`),
        expect.any(Error),
      );
    });

    it("sets whitelistDeletedAt on a later attempt when storage works", async () => {
      const batch = {
        id: batchId,
        startedAt: new Date("2026-11-04T10:00:00Z"),
        whitelistDeletedAt: null,
      };
      const jobs = [{ id: jobId, status: JobStatus.COMPLETED }];

      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(batch as any);
      vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue(jobs as any);
      const deletePrefixSpy = vi
        .spyOn(storage, "deletePrefix")
        .mockRejectedValueOnce(new Error("Storage temporary outage"));
      const markDeletedSpy = vi.spyOn(jobRepository, "markBatchWhitelistDeleted").mockResolvedValue(undefined as any);
      vi.spyOn(console, "error").mockImplementation(() => {});

      // First attempt fails -> leaves whitelistDeletedAt unset
      await checkAndCleanBatchWhitelist(batchId);
      expect(markDeletedSpy).not.toHaveBeenCalled();

      // Second attempt succeeds -> sets whitelistDeletedAt
      deletePrefixSpy.mockResolvedValueOnce(undefined as any);
      await checkAndCleanBatchWhitelist(batchId);
      expect(markDeletedSpy).toHaveBeenCalledWith(batchId);
    });

    it("retryPendingWhitelistCleanups retries each returned batch, and one failure doesn't stop the next", async () => {
      const failingBatchId = "batch-fail";
      const healthyBatchId = "batch-success";

      vi.spyOn(jobRepository, "getBatchesPendingWhitelistCleanup").mockResolvedValue([
        { id: failingBatchId },
        { id: healthyBatchId },
      ]);

      vi.spyOn(jobRepository, "getBatch").mockImplementation(async (id: string) => {
        if (id === failingBatchId) {
          throw new Error("Unexpected database error for failing batch");
        }
        return {
          id,
          startedAt: new Date("2026-11-04T10:00:00Z"),
          whitelistDeletedAt: null,
        } as any;
      });

      vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([
        { id: "job-1", status: JobStatus.COMPLETED },
      ] as any);

      vi.spyOn(storage, "deletePrefix").mockResolvedValue();
      const markDeletedSpy = vi.spyOn(jobRepository, "markBatchWhitelistDeleted").mockResolvedValue(undefined as any);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await retryPendingWhitelistCleanups();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to retry whitelist cleanup for batch ${failingBatchId}`),
        expect.any(Error),
      );
      expect(markDeletedSpy).not.toHaveBeenCalledWith(failingBatchId);
      expect(markDeletedSpy).toHaveBeenCalledWith(healthyBatchId);
    });

    it("getBatchesPendingWhitelistCleanup uses a query that excludes unstarted, already marked and still-running batches", async () => {
      const batches = [
        {
          id: "batch-terminal-pending",
          startedAt: new Date("2026-11-04T10:00:00Z"),
          whitelistDeletedAt: null,
          jobs: [
            { id: "j1", status: JobStatus.COMPLETED },
            { id: "j2", status: JobStatus.FAILED },
          ],
        },
        {
          id: "batch-unstarted-draft",
          startedAt: null,
          whitelistDeletedAt: null,
          jobs: [{ id: "j3", status: JobStatus.COMPLETED }],
        },
        {
          id: "batch-already-deleted",
          startedAt: new Date("2026-11-04T10:00:00Z"),
          whitelistDeletedAt: new Date("2026-11-04T10:05:00Z"),
          jobs: [{ id: "j4", status: JobStatus.COMPLETED }],
        },
        {
          id: "batch-still-running",
          startedAt: new Date("2026-11-04T10:00:00Z"),
          whitelistDeletedAt: null,
          jobs: [
            { id: "j5", status: JobStatus.COMPLETED },
            { id: "j6", status: JobStatus.PROCESSING },
          ],
        },
        {
          id: "batch-no-jobs",
          startedAt: new Date("2026-11-04T10:00:00Z"),
          whitelistDeletedAt: null,
          jobs: [],
        },
      ];

      const findManySpy = vi.spyOn(prisma.batch, "findMany").mockImplementation(async (args: any) => {
        const where = args.where;
        const matches = (b: (typeof batches)[0]) => {
          if (where.startedAt?.not === null && b.startedAt === null) return false;
          if (where.whitelistDeletedAt === null && b.whitelistDeletedAt !== null) return false;
          if (where.jobs?.some && b.jobs.length === 0) return false;
          if (where.jobs?.none) {
            const hasNonTerminalJob = b.jobs.some((job) => where.jobs.none.status.notIn.indexOf(job.status) === -1);
            if (hasNonTerminalJob) return false;
          }
          return true;
        };
        return batches.filter(matches).map((b) => ({ id: b.id })) as any;
      });

      const pending = await jobRepository.getBatchesPendingWhitelistCleanup();

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startedAt: { not: null },
            whitelistDeletedAt: null,
            jobs: {
              some: {},
              none: {
                status: { notIn: [JobStatus.COMPLETED, JobStatus.FAILED] },
              },
            },
          }),
          select: { id: true },
        }),
      );

      const pendingIds = pending.map((b) => b.id);
      expect(pendingIds).toContain("batch-terminal-pending");
      expect(pendingIds).not.toContain("batch-unstarted-draft");
      expect(pendingIds).not.toContain("batch-already-deleted");
      expect(pendingIds).not.toContain("batch-still-running");
      expect(pendingIds).not.toContain("batch-no-jobs");
    });
  });
});
