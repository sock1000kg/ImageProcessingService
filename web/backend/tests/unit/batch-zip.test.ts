import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as unzipper from "unzipper";

import { config } from "../../src/config";
import { createAccessToken, createBatchDownloadToken, verifyBatchDownloadToken } from "../../src/auth";
import {
  buildZipContentDisposition,
  createBatchDownloadTokenHandler,
  downloadBatchZipHandler,
  sanitizeEntryFilename,
} from "../../src/controllers/batches.controller";
import * as jobRepository from "../../src/repositories/job.repository";
import { RESULTS_BUCKET, storage } from "../../src/storage";
import { JobStatus } from "../../src/generated/prisma/client";
import { AppError } from "../../src/errors";

class MockResponse extends Writable {
  statusCode = 200;
  headers: Record<string, string> = {};
  chunks: Buffer[] = [];

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  json(data: unknown) {
    this.chunks.push(Buffer.from(JSON.stringify(data)));
    this.end();
    return this;
  }

  _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (Buffer.isBuffer(chunk)) {
      this.chunks.push(chunk);
    } else if (typeof chunk === "string") {
      this.chunks.push(Buffer.from(chunk, encoding));
    }
    callback();
  }

  getBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

class MockRequest extends EventEmitter {
  params: Record<string, string>;
  query: Record<string, string>;
  authUser?: { id: string; email: string };
  destroyed = false;

  constructor(
    options: {
      params?: Record<string, string>;
      query?: Record<string, string>;
      authUser?: { id: string; email: string };
    } = {},
  ) {
    super();
    this.params = options.params || {};
    this.query = options.query || {};
    this.authUser = options.authUser;
  }
}

describe("Batch Zip Download Unit Tests (Task 37)", () => {
  const userId = "123e4567-e89b-12d3-a456-426614174000";
  const otherUserId = "123e4567-e89b-12d3-a456-426614174001";
  const batchId = "123e4567-e89b-12d3-a456-426614174002";
  const otherBatchId = "123e4567-e89b-12d3-a456-426614174003";

  beforeEach(() => {
    vi.restoreAllMocks();
    config.JWT_SECRET = "test-secret-with-at-least-32-characters";
  });

  describe("Download Token Primitives", () => {
    it("creates and verifies a valid batch download token", () => {
      const token = createBatchDownloadToken(userId, batchId);
      const verified = verifyBatchDownloadToken(token, batchId);
      expect(verified).toEqual({ userId, batchId });
    });

    it("rejects a download token issued for another batch", () => {
      const token = createBatchDownloadToken(userId, batchId);
      expect(() => verifyBatchDownloadToken(token, otherBatchId)).toThrowError(
        expect.objectContaining({
          status: 401,
          code: "INVALID_DOWNLOAD_TOKEN",
        }),
      );
    });

    it("rejects an expired download token", () => {
      vi.useFakeTimers();
      try {
        const now = 1700000000;
        vi.setSystemTime(now * 1000);
        const token = createBatchDownloadToken(userId, batchId);

        // Advance 61 seconds (token TTL is 60s)
        vi.setSystemTime((now + 61) * 1000);

        expect(() => verifyBatchDownloadToken(token, batchId)).toThrowError(
          expect.objectContaining({
            status: 401,
            code: "INVALID_DOWNLOAD_TOKEN",
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects a normal access token passed as a download token", () => {
      const accessToken = createAccessToken({ id: userId, email: "user@example.com" });
      expect(() => verifyBatchDownloadToken(accessToken, batchId)).toThrowError(
        expect.objectContaining({
          status: 401,
          code: "INVALID_DOWNLOAD_TOKEN",
        }),
      );
    });

    it("rejects a tampered or malformed download token", () => {
      const token = createBatchDownloadToken(userId, batchId);
      expect(() => verifyBatchDownloadToken(`${token}corrupt`, batchId)).toThrowError(
        expect.objectContaining({
          status: 401,
          code: "INVALID_DOWNLOAD_TOKEN",
        }),
      );
      expect(() => verifyBatchDownloadToken("", batchId)).toThrowError(
        expect.objectContaining({
          status: 401,
          code: "INVALID_DOWNLOAD_TOKEN",
        }),
      );
    });
  });

  describe("Header and Entry Name Sanitization", () => {
    it("builds RFC 5987 Content-Disposition header with ASCII fallback and UTF-8 filename*", () => {
      const header = buildZipContentDisposition("Bộ ảnh du lịch 2026");
      expect(header).toContain('filename="B_ _nh du l_ch 2026.zip"');
      expect(header).toContain("filename*=UTF-8''B%E1%BB%99%20%E1%BA%A3nh%20du%20l%E1%BB%8Bch%202026.zip");
    });

    it("strips dangerous characters and path traversal from zip filename", () => {
      const header = buildZipContentDisposition('../../../bad/name"quote:test*');
      expect(header).not.toContain("../");
      expect(header).not.toContain('"quote');
    });

    it("sanitizes entry names, strips directory paths and '..', and preserves result extension", () => {
      const used = new Set<string>();
      const entry1 = sanitizeEntryFilename("../../secret/photo.png", "batch/job1/result.jpg", used);
      expect(entry1).toBe("photo.jpg");

      // Duplicate filename gets (2) suffix
      const entry2 = sanitizeEntryFilename("photo.png", "batch/job2/result.jpg", used);
      expect(entry2).toBe("photo (2).jpg");

      // Third duplicate gets (3) suffix
      const entry3 = sanitizeEntryFilename("nested/path/photo.jpeg", "batch/job3/result.jpg", used);
      expect(entry3).toBe("photo (3).jpg");
    });
  });

  describe("POST /api/batches/:id/download-token controller", () => {
    it("returns 200 with download url when caller is the batch owner", async () => {
      const mockBatch = {
        id: batchId,
        userId,
        name: "My Vacation Batch",
      };
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue(mockBatch as any);

      const req = new MockRequest({
        params: { id: batchId },
        authUser: { id: userId, email: "user@example.com" },
      });
      const res = new MockResponse();
      const next = vi.fn();

      await createBatchDownloadTokenHandler(req as any, res as any, next);

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.getBuffer().toString("utf8"));
      expect(data.url).toMatch(new RegExp(`^/api/batches/${batchId}/download\\.zip\\?token=.+`));
    });

    it("returns 404 NOT_FOUND when requesting token for another user's batch", async () => {
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue(null);

      const req = new MockRequest({
        params: { id: batchId },
        authUser: { id: otherUserId, email: "other@example.com" },
      });
      const res = new MockResponse();
      const next = vi.fn();

      await createBatchDownloadTokenHandler(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          code: "NOT_FOUND",
        }),
      );
    });
  });

  describe("GET /api/batches/:id/download.zip controller", () => {
    it("returns 401 INVALID_DOWNLOAD_TOKEN when token is missing", async () => {
      const req = new MockRequest({
        params: { id: batchId },
        query: {},
      });
      const res = new MockResponse();
      const next = vi.fn();

      await downloadBatchZipHandler(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          code: "INVALID_DOWNLOAD_TOKEN",
        }),
      );
    });

    it("returns 401 INVALID_DOWNLOAD_TOKEN when token belongs to another batch", async () => {
      const token = createBatchDownloadToken(userId, otherBatchId);
      const req = new MockRequest({
        params: { id: batchId },
        query: { token },
      });
      const res = new MockResponse();
      const next = vi.fn();

      await downloadBatchZipHandler(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          code: "INVALID_DOWNLOAD_TOKEN",
        }),
      );
    });

    it("returns 401 INVALID_DOWNLOAD_TOKEN when token was created for another user", async () => {
      const token = createBatchDownloadToken(otherUserId, batchId);
      const mockBatch = {
        id: batchId,
        userId, // owned by userId, not otherUserId
        name: "Batch",
      };
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(mockBatch as any);

      const req = new MockRequest({
        params: { id: batchId },
        query: { token },
      });
      const res = new MockResponse();
      const next = vi.fn();

      await downloadBatchZipHandler(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          code: "INVALID_DOWNLOAD_TOKEN",
        }),
      );
    });

    it("returns 404 NOT_FOUND when batch does not exist", async () => {
      const token = createBatchDownloadToken(userId, batchId);
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(null);

      const req = new MockRequest({
        params: { id: batchId },
        query: { token },
      });
      const res = new MockResponse();
      const next = vi.fn();

      await downloadBatchZipHandler(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          code: "NOT_FOUND",
        }),
      );
    });

    it("returns 404 NO_RESULTS when batch has 0 COMPLETED jobs", async () => {
      const token = createBatchDownloadToken(userId, batchId);
      const mockBatch = { id: batchId, userId, name: "Batch" };
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(mockBatch as any);
      vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([
        { id: "j1", status: JobStatus.FAILED } as any,
        { id: "j2", status: JobStatus.PENDING } as any,
      ]);

      const req = new MockRequest({
        params: { id: batchId },
        query: { token },
      });
      const res = new MockResponse();
      const next = vi.fn();

      await downloadBatchZipHandler(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          code: "NO_RESULTS",
        }),
      );
    });

    it("streams a valid zip archive with sanitized names, duplicate suffixes, and MISSING.txt", async () => {
      const token = createBatchDownloadToken(userId, batchId);
      const mockBatch = { id: batchId, userId, name: "Beach Trip" };
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(mockBatch as any);

      const completedJobs = [
        {
          id: "j1",
          status: JobStatus.COMPLETED,
          originalFilename: "portrait.png",
          outputKey: `${batchId}/j1/result.jpg`,
        },
        {
          id: "j2",
          status: JobStatus.COMPLETED,
          originalFilename: "portrait.png", // Duplicate name
          outputKey: `${batchId}/j2/result.jpg`,
        },
        {
          id: "j3",
          status: JobStatus.COMPLETED,
          originalFilename: "folder/../sub/scenery.webp",
          outputKey: `${batchId}/j3/result.webp`,
        },
        {
          id: "j4",
          status: JobStatus.COMPLETED,
          originalFilename: "lost-file.png",
          outputKey: `${batchId}/j4/result.jpg`, // will be missing in MinIO
        },
      ];
      vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue(completedJobs as any);

      vi.spyOn(storage, "getObjectStream").mockImplementation(async (_bucket, key) => {
        if (key.includes("j1")) {
          return { stream: Readable.from([Buffer.from("fake-jpeg-image-1")]) };
        }
        if (key.includes("j2")) {
          return { stream: Readable.from([Buffer.from("fake-jpeg-image-2")]) };
        }
        if (key.includes("j3")) {
          return { stream: Readable.from([Buffer.from("fake-webp-image-3")]) };
        }
        // j4 is missing from MinIO
        return null;
      });

      const req = new MockRequest({
        params: { id: batchId },
        query: { token },
      });
      const res = new MockResponse();
      const next = vi.fn();

      const finishPromise = new Promise<void>((resolve) => res.on("finish", resolve));

      await downloadBatchZipHandler(req as any, res as any, next);
      await finishPromise;

      expect(res.headers["content-type"]).toBe("application/zip");
      expect(res.headers["content-disposition"]).toContain('filename="Beach Trip.zip"');

      const zipBuf = res.getBuffer();
      expect(zipBuf.length).toBeGreaterThan(0);

      // Verify the zip contents using unzipper
      const directory = await unzipper.Open.buffer(zipBuf);
      const entryPaths = directory.files.map((f) => f.path);

      expect(entryPaths).toContain("portrait.jpg");
      expect(entryPaths).toContain("portrait (2).jpg");
      expect(entryPaths).toContain("scenery.webp");
      expect(entryPaths).toContain("MISSING.txt");

      // Verify content of MISSING.txt
      const missingFile = directory.files.find((f) => f.path === "MISSING.txt");
      expect(missingFile).toBeDefined();
      const missingContent = (await missingFile!.buffer()).toString("utf8");
      expect(missingContent).toContain("lost-file.jpg");

      // Verify image content
      const img1 = directory.files.find((f) => f.path === "portrait.jpg");
      expect((await img1!.buffer()).toString("utf8")).toBe("fake-jpeg-image-1");
    });

    it("aborts archive and destroys active MinIO stream when client aborts request", async () => {
      const token = createBatchDownloadToken(userId, batchId);
      const mockBatch = { id: batchId, userId, name: "Batch" };
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(mockBatch as any);

      const slowStream = new Readable({
        read() {},
      });
      const destroySpy = vi.spyOn(slowStream, "destroy");

      vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([
        {
          id: "j1",
          status: JobStatus.COMPLETED,
          originalFilename: "image.jpg",
          outputKey: `${batchId}/j1/result.jpg`,
        } as any,
      ]);

      vi.spyOn(storage, "getObjectStream").mockResolvedValue({
        stream: slowStream,
      });

      const req = new MockRequest({
        params: { id: batchId },
        query: { token },
      });
      const res = new MockResponse();
      const next = vi.fn();

      const handlerPromise = downloadBatchZipHandler(req as any, res as any, next);

      // Simulate client abort while stream is active
      setTimeout(() => {
        req.emit("close");
      }, 10);

      await handlerPromise;
      expect(destroySpy).toHaveBeenCalled();
    });
  });
});
