import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBatchById } from "../../src/services/batch.service";
import { purgeBatch } from "../../src/services/retention.service";
import * as jobRepository from "../../src/repositories/job.repository";
import { prisma } from "../../src/db/prisma";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../../src/storage";
import { JobStatus } from "../../src/generated/prisma/client";

describe("Background Batch Deletion Unit Tests", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const batchId = "22222222-2222-4222-8222-222222222222";
  const jobId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("deleteBatchById", () => {
    it("returns success without awaiting storage.deletePrefix before answering, and sets deleteRequestedAt", async () => {
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
        id: batchId,
        userId,
        name: "Test Batch",
        deleteRequestedAt: null,
      } as any);
      vi.spyOn(jobRepository, "batchHasActiveJobs").mockResolvedValue(false);
      vi.spyOn(prisma.uploadSession, "findMany").mockResolvedValue([]);

      const markSpy = vi.spyOn(jobRepository, "markBatchDeleteRequested").mockResolvedValue(true);

      let deletePrefixStarted = false;
      let resolveDeletePrefix: () => void;
      const deletePrefixPromise = new Promise<void>((resolve) => {
        resolveDeletePrefix = resolve;
      });

      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockImplementation(async () => {
        deletePrefixStarted = true;
        await deletePrefixPromise;
      });

      // Execute deleteBatchById
      const deletePromise = deleteBatchById(batchId, userId);

      // deleteBatchById should resolve to true without waiting for deletePrefix to complete
      const result = await deletePromise;
      expect(result).toBe(true);
      expect(markSpy).toHaveBeenCalledWith(batchId, userId);

      // Clean up the hanging promise for storage
      resolveDeletePrefix!();
      await new Promise((r) => setTimeout(r, 10));
    });

    it("does not fail when immediate cleanup (purgeBatch) encounters a storage failure", async () => {
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
        id: batchId,
        userId,
        name: "Test Batch",
        deleteRequestedAt: null,
      } as any);
      vi.spyOn(jobRepository, "batchHasActiveJobs").mockResolvedValue(false);
      vi.spyOn(prisma.uploadSession, "findMany").mockResolvedValue([]);
      vi.spyOn(jobRepository, "markBatchDeleteRequested").mockResolvedValue(true);

      // storage.deletePrefix throws
      vi.spyOn(storage, "deletePrefix").mockRejectedValue(new Error("MinIO down"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await deleteBatchById(batchId, userId);
      expect(result).toBe(true);

      // Wait a tick for the unhandled catch to log
      await new Promise((r) => setTimeout(r, 20));
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("purgeBatch", () => {
    it("when uploads storage fails, the row is kept and returns false", async () => {
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockImplementation(async (bucket) => {
        if (bucket === UPLOADS_BUCKET) {
          throw new Error("Uploads MinIO failure");
        }
      });
      const deleteRowSpy = vi.spyOn(jobRepository, "deleteBatchRow").mockResolvedValue(true);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const purged = await purgeBatch(batchId);
      expect(purged).toBe(false);
      expect(deleteRowSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to delete objects for batch ${batchId} in ${UPLOADS_BUCKET}`),
        expect.any(Error),
      );
    });

    it("when results storage fails, the row is kept and returns false", async () => {
      vi.spyOn(storage, "deletePrefix").mockImplementation(async (bucket) => {
        if (bucket === RESULTS_BUCKET) {
          throw new Error("Results MinIO failure");
        }
      });
      const deleteRowSpy = vi.spyOn(jobRepository, "deleteBatchRow").mockResolvedValue(true);
      vi.spyOn(console, "error").mockImplementation(() => {});

      const purged = await purgeBatch(batchId);
      expect(purged).toBe(false);
      expect(deleteRowSpy).not.toHaveBeenCalled();
    });

    it("when both storage prefixes succeed, deletes the row and returns true", async () => {
      const deletePrefixSpy = vi.spyOn(storage, "deletePrefix").mockResolvedValue();
      const deleteRowSpy = vi.spyOn(jobRepository, "deleteBatchRow").mockResolvedValue(true);

      const purged = await purgeBatch(batchId);
      expect(purged).toBe(true);
      expect(deletePrefixSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, `${batchId}/`);
      expect(deletePrefixSpy).toHaveBeenCalledWith(RESULTS_BUCKET, `${batchId}/`);
      expect(deleteRowSpy).toHaveBeenCalledWith(batchId);
    });

    it("returns false if row deletion returns false even when storage succeeded", async () => {
      vi.spyOn(storage, "deletePrefix").mockResolvedValue();
      vi.spyOn(jobRepository, "deleteBatchRow").mockResolvedValue(false);

      const purged = await purgeBatch(batchId);
      expect(purged).toBe(false);
    });
  });

  describe("User-facing lookups ignore marked batches", () => {
    it("getBatchOwnedByUser scopes query with deleteRequestedAt: null", async () => {
      const findFirstSpy = vi.spyOn(prisma.batch, "findFirst").mockResolvedValue(null);

      await jobRepository.getBatchOwnedByUser(batchId, userId);

      expect(findFirstSpy).toHaveBeenCalledWith({
        where: { id: batchId, userId, deleteRequestedAt: null },
      });
    });

    it("getJobOwnedByUser scopes query with batch: { userId, deleteRequestedAt: null }", async () => {
      const findFirstSpy = vi.spyOn(prisma.job, "findFirst").mockResolvedValue(null);

      await jobRepository.getJobOwnedByUser(jobId, userId);

      expect(findFirstSpy).toHaveBeenCalledWith({
        where: { id: jobId, batch: { userId, deleteRequestedAt: null } },
      });
    });

    it("listBatchesByUserId scopes query with deleteRequestedAt: null", async () => {
      const findManySpy = vi.spyOn(prisma.batch, "findMany").mockResolvedValue([]);

      await jobRepository.listBatchesByUserId(userId, { limit: 10 });

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, deleteRequestedAt: null },
        }),
      );
    });

    it("getStats scopes query with batch: { userId, deleteRequestedAt: null }", async () => {
      const groupBySpy = vi.spyOn(prisma.job, "groupBy").mockResolvedValue([]);

      await jobRepository.getStats(userId);

      expect(groupBySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { batch: { userId, deleteRequestedAt: null } },
        }),
      );
    });

    it("getAccountUsage raw SQL filters out delete_requested_at IS NOT NULL", async () => {
      const queryRawSpy = vi
        .spyOn(prisma, "$queryRaw")
        .mockResolvedValue([{ batches: 0, jobs: 0, bytes: BigInt(0) }] as any);

      await jobRepository.getAccountUsage(userId);

      expect(queryRawSpy).toHaveBeenCalled();
      const rawQueryStrings = (queryRawSpy.mock.calls[0] as any)[0];
      const fullSql = Array.isArray(rawQueryStrings) ? rawQueryStrings.join(" ") : String(rawQueryStrings);
      expect(fullSql).toContain("delete_requested_at IS NULL");
    });
  });

  describe("Retention timer picks up marked batches", () => {
    it("getBatchesToPurge returns marked batches regardless of age and enforces no unfinished jobs", async () => {
      const findManySpy = vi.spyOn(prisma.batch, "findMany").mockResolvedValue([{ id: batchId }] as any);

      await jobRepository.getBatchesToPurge(7);

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([expect.objectContaining({ deleteRequestedAt: { not: null } })]),
            jobs: {
              none: {
                status: {
                  notIn: [JobStatus.COMPLETED, JobStatus.FAILED],
                },
              },
            },
          }),
        }),
      );
    });

    it("getBatchesToPurge with undefined retentionDays also returns marked batches", async () => {
      const findManySpy = vi.spyOn(prisma.batch, "findMany").mockResolvedValue([{ id: batchId }] as any);

      await jobRepository.getBatchesToPurge(undefined);

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([expect.objectContaining({ deleteRequestedAt: { not: null } })]),
            jobs: {
              none: {
                status: {
                  notIn: [JobStatus.COMPLETED, JobStatus.FAILED],
                },
              },
            },
          }),
        }),
      );
    });
  });
});
