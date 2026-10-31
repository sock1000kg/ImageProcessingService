import { describe, expect, it } from "vitest";
import http from "node:http";
import {
  batchNameSchema,
  formatDefaultBatchName,
  imageResultSummarySchema,
  patchBatchBodySchema,
  toBatchResponse,
  toReportResponse,
  toJobResponse,
  validateIdParam,
  validateUploadFiles,
} from "../../src/dto";
import { createApp } from "../../src/app";

describe("DTO Validation and Schemas (Task 26)", () => {
  describe("Result Summary Schema (§3 Contract)", () => {
    const contractExample = {
      imageSize: [1920, 1080],
      counts: { face: 3, plate: 1, whitelistedFace: 1, redacted: 3, lowConfidence: 1 },
      detections: [
        {
          label: "face",
          confidence: 0.92,
          box: [34, 12, 120, 250],
          redacted: true,
          whitelisted: false,
          lowConfidence: false,
          similarity: 0.18,
        },
        {
          label: "face",
          confidence: 0.88,
          box: [400, 40, 480, 160],
          redacted: false,
          whitelisted: true,
          similarity: 0.71,
          whitelistRef: 0,
        },
        {
          label: "face",
          confidence: 0.41,
          box: [600, 90, 640, 140],
          redacted: true,
          whitelisted: false,
          lowConfidence: true,
          similarity: 0.55,
        },
        {
          label: "plate",
          confidence: 0.81,
          box: [220, 300, 310, 340],
          redacted: true,
          whitelisted: false,
          lowConfidence: false,
        },
      ],
      redaction: { style: "pixelate", strength: 12, padding: 0.1 },
      model: "yolov8n-oiv7",
      processingTimeMs: 420,
    };

    it("parses contract §3 resultSummary example and preserves unknown extra keys", () => {
      const parsed = imageResultSummarySchema.safeParse(contractExample);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.model).toBe("yolov8n-oiv7");
        expect(parsed.data.processingTimeMs).toBe(420);
        expect(parsed.data.counts?.face).toBe(3);
        expect(parsed.data.detections).toHaveLength(4);
        // passthrough extra keys
        expect((parsed.data as Record<string, unknown>).imageSize).toEqual([1920, 1080]);
        expect((parsed.data as Record<string, unknown>).redaction).toEqual({
          style: "pixelate",
          strength: 12,
          padding: 0.1,
        });
      }
    });

    it("rejects detection with box of length 3 (box: [1, 2, 3])", () => {
      const invalidSummary = {
        detections: [{ label: "face", confidence: 0.9, box: [1, 2, 3], redacted: true }],
      };
      const parsed = imageResultSummarySchema.safeParse(invalidSummary);
      expect(parsed.success).toBe(false);
    });

    it("treats invalid summary (box: [1, 2, 3]) as missing in toReportResponse but preserves raw in toJobResponse", () => {
      const invalidSummary = {
        counts: { face: 1 },
        detections: [{ label: "face", confidence: 0.9, box: [1, 2, 3], redacted: true }],
      };

      const dummyJob = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        batchId: "123e4567-e89b-12d3-a456-426614174001",
        originalFilename: "sample.jpg",
        status: "COMPLETED",
        progress: 100,
        stage: "DONE",
        resultUrl: "/results/sample.jpg",
        resultSummary: invalidSummary,
        error: null,
        createdAt: new Date("2026-10-30T00:00:00Z"),
        updatedAt: new Date("2026-10-30T00:00:00Z"),
      };

      const dummyBatch = {
        id: "123e4567-e89b-12d3-a456-426614174001",
        config: {},
        whitelistKeys: [],
        whitelistDeletedAt: null,
        createdAt: new Date("2026-10-30T00:00:00Z"),
      };

      // toReportResponse treats invalid summary as missing (no detections, no counts)
      const report = toReportResponse(dummyBatch as never, [dummyJob as never]);
      expect(report.images[0]?.detections).toEqual([]);
      expect(report.images[0]?.counts).toBeNull();
      expect(report.images[0]?.needsReview).toBe(false);
      expect(report.totals.faces).toBe(0);

      // toJobResponse still returns raw resultSummary without crashing
      const jobRes = toJobResponse(dummyJob as never);
      expect(jobRes?.resultSummary).toEqual(invalidSummary);
    });
  });

  describe("ID Param Validation", () => {
    it("validates valid UUID", () => {
      const validUuid = "123e4567-e89b-12d3-a456-426614174000";
      expect(validateIdParam({ id: validUuid })).toBe(validUuid);
    });

    it("throws ZodError on non-UUID", () => {
      expect(() => validateIdParam({ id: "not-a-uuid" })).toThrow();
      expect(() => validateIdParam({ id: 12345 })).toThrow();
      expect(() => validateIdParam({})).toThrow();
    });

    it("returns 400 VALIDATION_ERROR on GET /api/batches/not-a-uuid", async () => {
      const app = createApp();
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/batches/not-a-uuid`);
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string; message: string; details: unknown } };
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.message).toBe("Validation failed");
        expect(Array.isArray(body.error.details)).toBe(true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("returns 400 VALIDATION_ERROR on GET /api/jobs/not-a-uuid", async () => {
      const app = createApp();
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/jobs/not-a-uuid`);
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string; message: string; details: unknown } };
        expect(body.error.code).toBe("VALIDATION_ERROR");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("returns 400 with message pointing to /files when files field is present on POST /api/batches", async () => {
      const app = createApp();
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const formData = new FormData();
        formData.append("files", new Blob(["content"]), "image.jpg");
        const res = await fetch(`http://127.0.0.1:${port}/api/batches`, {
          method: "POST",
          body: formData,
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.message).toContain("/files");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe("Upload Files Validation Helper", () => {
    it("throws 400 when files are empty", () => {
      expect(() => validateUploadFiles({ files: [] })).toThrow("At least one image file is required");
    });

    it("throws 400 when whitelist files exceed 5", () => {
      const dummyFile = {
        originalname: "a.jpg",
        mimetype: "image/jpeg",
        size: 100,
        buffer: Buffer.from(""),
      } as Express.Multer.File;

      expect(() =>
        validateUploadFiles({
          files: [dummyFile],
          whitelist: Array(6).fill(dummyFile),
        }),
      ).toThrow("Too many whitelist files: maximum allowed is 5");
    });

    it("throws 400 when file format is unsupported", () => {
      const invalidFile = {
        originalname: "bad.gif",
        mimetype: "image/gif",
        size: 100,
        buffer: Buffer.from(""),
      } as Express.Multer.File;

      expect(() => validateUploadFiles({ files: [invalidFile] })).toThrow(
        "has unsupported format. Only JPEG, PNG, and WEBP images are supported",
      );
    });

    it("throws 413 FILE_TOO_LARGE when single file exceeds limit", () => {
      const bigFile = {
        originalname: "big.jpg",
        mimetype: "image/jpeg",
        size: 60 * 1024 * 1024,
        buffer: Buffer.from(""),
      } as Express.Multer.File;

      expect(() => validateUploadFiles({ files: [bigFile] })).toThrow(/exceeds limit/);
    });
  });

  describe("Batch Name Schema and Validation (Task 28)", () => {
    it("trims whitespace from name", () => {
      expect(batchNameSchema.parse("   My Custom Batch   ")).toBe("My Custom Batch");
    });

    it("defaults empty string and whitespace-only string to default format", () => {
      const emptyResult = batchNameSchema.parse("");
      const spacesResult = batchNameSchema.parse("     ");
      expect(emptyResult).toMatch(/^Batch \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(spacesResult).toMatch(/^Batch \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });

    it("rejects names longer than 100 characters after trimming with validation error", () => {
      const exact100 = "a".repeat(100);
      expect(batchNameSchema.parse(exact100)).toBe(exact100);
      expect(batchNameSchema.parse(`  ${exact100}  `)).toBe(exact100);

      const tooLong101 = "a".repeat(101);
      expect(() => batchNameSchema.parse(tooLong101)).toThrow();
      expect(() => batchNameSchema.parse(`  ${tooLong101}  `)).toThrow();
    });

    it("rejects names containing control characters with validation error", () => {
      expect(() => batchNameSchema.parse("hello\x00world")).toThrow();
      expect(() => batchNameSchema.parse("bad\nname")).toThrow();
      expect(() => batchNameSchema.parse("tab\tcharacter")).toThrow();
      expect(() => batchNameSchema.parse("carriage\rreturn")).toThrow();
      expect(() => batchNameSchema.parse("\x1fcontrol")).toThrow();
    });

    it("formats default batch name consistently as Batch <YYYY-MM-DD HH:mm> in UTC", () => {
      const fixedDate = new Date("2026-10-31T14:05:09Z");
      expect(formatDefaultBatchName(fixedDate)).toBe("Batch 2026-10-31 14:05");
    });

    it("patchBatchBodySchema enforces required name and strict schema without unknown keys", () => {
      // Valid PATCH payload
      const valid = patchBatchBodySchema.parse({ name: "Updated Batch Name" });
      expect(valid.name).toBe("Updated Batch Name");

      // Empty string defaults to server format
      const emptyRenamed = patchBatchBodySchema.parse({ name: "" });
      expect(emptyRenamed.name).toMatch(/^Batch \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

      // Missing name -> error
      expect(() => patchBatchBodySchema.parse({})).toThrow();

      // Unknown keys -> error (strict schema)
      expect(() => patchBatchBodySchema.parse({ name: "New Name", extraKey: "not allowed" })).toThrow();
      expect(() => patchBatchBodySchema.parse({ other: 123 })).toThrow();

      // Non-string name -> error
      expect(() => patchBatchBodySchema.parse({ name: 12345 })).toThrow();
    });

    it("includes name in toBatchResponse and batchName in toReportResponse", () => {
      const dummyBatch = {
        id: "123e4567-e89b-12d3-a456-426614174001",
        name: "Test Batch Name",
        config: {},
        whitelistKeys: [],
        whitelistDeletedAt: null,
        startedAt: null,
        createdAt: new Date("2026-10-30T00:00:00Z"),
      };

      const batchRes = toBatchResponse(dummyBatch as never, []);
      expect(batchRes.name).toBe("Test Batch Name");

      const reportRes = toReportResponse(dummyBatch as never, []);
      expect(reportRes.batchName).toBe("Test Batch Name");
    });
  });
});
