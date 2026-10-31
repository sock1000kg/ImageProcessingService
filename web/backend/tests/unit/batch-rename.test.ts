import { beforeEach, describe, expect, it, vi } from "vitest";
import { renameBatch } from "../../src/services/batch.service";
import * as jobRepository from "../../src/repositories/job.repository";
import { updateBatchHandler } from "../../src/controllers/batches.controller";
import { AppError } from "../../src/errors";
import { ZodError } from "zod";

describe("Batch Rename Unit Tests (Task 28)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validBatchId = "123e4567-e89b-42d3-a456-426614174000";

  it("renames batch successfully in any status and returns updated batch response", async () => {
    const existingBatch = {
      id: validBatchId,
      name: "Old Batch Name",
      config: { targets: ["face"], style: "blur" },
      whitelistKeys: [],
      whitelistDeletedAt: null,
      startedAt: new Date("2026-10-31T10:00:00Z"),
      createdAt: new Date("2026-10-31T09:00:00Z"),
    };

    const updatedBatch = {
      ...existingBatch,
      name: "New Batch Name",
    };

    vi.spyOn(jobRepository, "getBatch").mockResolvedValue(existingBatch as any);
    vi.spyOn(jobRepository, "updateBatchName").mockResolvedValue(updatedBatch as any);
    vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([]);

    const result = await renameBatch(validBatchId, "  New Batch Name  ");
    expect(result.id).toBe(validBatchId);
    expect(result.name).toBe("New Batch Name");
    expect(jobRepository.updateBatchName).toHaveBeenCalledWith(validBatchId, "New Batch Name");
  });

  it("throws 404 NOT_FOUND when renaming unknown batch id", async () => {
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue(null);

    await expect(renameBatch("00000000-0000-0000-0000-000000000000", "New Name")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Batch not found",
    });
  });

  it("throws validation error when new name exceeds 100 characters", async () => {
    const existingBatch = {
      id: validBatchId,
      name: "Old Name",
      config: {},
      whitelistKeys: [],
      whitelistDeletedAt: null,
      startedAt: null,
      createdAt: new Date(),
    };
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue(existingBatch as any);

    await expect(renameBatch(validBatchId, "a".repeat(101))).rejects.toThrow();
  });

  it("throws validation error when new name contains control characters", async () => {
    const existingBatch = {
      id: validBatchId,
      name: "Old Name",
      config: {},
      whitelistKeys: [],
      whitelistDeletedAt: null,
      startedAt: null,
      createdAt: new Date(),
    };
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue(existingBatch as any);

    await expect(renameBatch(validBatchId, "bad\x00name")).rejects.toThrow();
    await expect(renameBatch(validBatchId, "line\nbreak")).rejects.toThrow();
  });

  it("renames with default name when empty string is provided", async () => {
    const existingBatch = {
      id: validBatchId,
      name: "Old Name",
      config: {},
      whitelistKeys: [],
      whitelistDeletedAt: null,
      startedAt: null,
      createdAt: new Date(),
    };
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue(existingBatch as any);
    vi.spyOn(jobRepository, "updateBatchName").mockImplementation(
      async (_id, name) =>
        ({
          ...existingBatch,
          name,
        }) as any,
    );
    vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([]);

    const result = await renameBatch(validBatchId, "   ");
    expect(result.name).toMatch(/^Batch \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  describe("updateBatchHandler controller", () => {
    it("handles valid PATCH request returning 200 { batch }", async () => {
      const existingBatch = {
        id: validBatchId,
        name: "Old",
        config: {},
        whitelistKeys: [],
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date(),
      };
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(existingBatch as any);
      vi.spyOn(jobRepository, "updateBatchName").mockResolvedValue({
        ...existingBatch,
        name: "Renamed",
      } as any);
      vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([]);

      const req: any = {
        params: { id: validBatchId },
        body: { name: "Renamed" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await updateBatchHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          batch: expect.objectContaining({ name: "Renamed" }),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects unknown keys in body with 400 VALIDATION_ERROR (strict schema)", async () => {
      const req: any = {
        params: { id: validBatchId },
        body: { name: "Renamed", unexpected: "key" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await updateBatchHandler(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ZodError);
    });

    it("rejects missing name field with 400 VALIDATION_ERROR", async () => {
      const req: any = {
        params: { id: validBatchId },
        body: {},
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await updateBatchHandler(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ZodError);
    });

    it("passes notFound error to next when batch does not exist", async () => {
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(null);

      const req: any = {
        params: { id: validBatchId },
        body: { name: "Renamed" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await updateBatchHandler(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(404);
    });
  });
});
