import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { config } from "../../src/config";
import { JobStatus } from "../../src/generated/prisma/client";
import * as jobRepository from "../../src/repositories/job.repository";
import * as faceListRepository from "../../src/repositories/face-list.repository";
import { presignGetUrl, RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../../src/storage";
import {
  buildJobResultFilename,
  getBatchWhitelistPresignedUrl,
  getJobOriginalPresignedUrl,
  getJobResultPresignedUrl,
} from "../../src/services/presign.service";
import { listBatches } from "../../src/services/batch.service";
import { getFacePresignedUrl } from "../../src/services/face-list.service";
import { getJobOriginalUrlHandler, getJobResultUrlHandler } from "../../src/controllers/jobs.controller";
import { getFaceUrlHandler } from "../../src/controllers/face-lists.controller";
import { getBatchWhitelistPhotoUrlHandler } from "../../src/controllers/batches.controller";
import { buildAttachmentContentDisposition, sanitizeAttachmentFilename } from "../../src/attachment";
import { createApp } from "../../src/app";
import { createAccessToken } from "../../src/auth";
import { toBatchResponse, toJobResponse } from "../../src/dto";

describe("Presigned URLs Backend Unit Tests (Task 87)", () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const otherUserId = "987e6543-e21b-42d3-a456-426614174999";
  const batchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const listId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  beforeEach(() => {
    vi.restoreAllMocks();
    // Why: tokens are signed in tests; CI has no web/.env, so JWT_SECRET must not come from the environment.
    config.JWT_SECRET = "test-secret-with-at-least-32-characters";
  });

  const createMockResponse = () => {
    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: null as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        return this;
      },
      setHeader(key: string, val: string) {
        this.headers[key.toLowerCase()] = val;
        return this;
      },
    };
    return res;
  };

  describe("Helper: presignGetUrl", () => {
    it("generates presigned URL pointing to S3_PUBLIC_ENDPOINT with bucket and key", async () => {
      const result = await presignGetUrl("results", "batch-1/job-1/result.jpg", {
        ttlSeconds: 3600,
      });

      expect(result.url).toBeDefined();
      expect(result.expiresAt).toBeDefined();

      const parsedUrl = new URL(result.url);
      const expectedHost = new URL(config.S3_PUBLIC_ENDPOINT).host;
      expect(parsedUrl.host).toBe(expectedHost);
      expect(parsedUrl.pathname).toBe("/results/batch-1/job-1/result.jpg");
      expect(parsedUrl.searchParams.get("X-Amz-Expires")).toBe("3600");

      const diffSec = Math.round((new Date(result.expiresAt).getTime() - Date.now()) / 1000);
      expect(diffSec).toBeGreaterThanOrEqual(3590);
      expect(diffSec).toBeLessThanOrEqual(3610);
    });

    it("attaches response-cache-control when cacheControl option is provided", async () => {
      const result = await presignGetUrl("uploads", "inputs/photo.jpg", {
        ttlSeconds: 300,
        cacheControl: "private, no-store",
      });

      const parsedUrl = new URL(result.url);
      expect(parsedUrl.searchParams.get("response-cache-control")).toBe("private, no-store");
      expect(parsedUrl.searchParams.get("X-Amz-Expires")).toBe("300");
    });

    it("attaches response-content-disposition when contentDisposition option is provided", async () => {
      const result = await presignGetUrl("results", "outputs/photo.webp", {
        ttlSeconds: 3600,
        contentDisposition: 'attachment; filename="my-photo.webp"',
      });

      const parsedUrl = new URL(result.url);
      expect(parsedUrl.searchParams.get("response-content-disposition")).toBe('attachment; filename="my-photo.webp"');
    });

    it("strips leading slash from key to prevent double slashes in signed path", async () => {
      const result = await presignGetUrl("results", "/clean/key.png", { ttlSeconds: 60 });
      const parsedUrl = new URL(result.url);
      expect(parsedUrl.pathname).toBe("/results/clean/key.png");
    });
  });

  describe("Filename helper: buildJobResultFilename", () => {
    it("preserves stem and swaps original extension with output extension", () => {
      expect(buildJobResultFilename("avatar.png", "results/b/j/result.jpg")).toBe("avatar.jpg");
      expect(buildJobResultFilename("photo.jpeg", "results/b/j/result.webp")).toBe("photo.webp");
      expect(buildJobResultFilename("doc.test.bmp", "results/b/j/result.png")).toBe("doc.test.png");
    });

    it("handles complex paths or empty stems gracefully", () => {
      expect(buildJobResultFilename("../../../secret.png", "results/b/j/result.jpg")).toBe("secret.jpg");
      expect(buildJobResultFilename(".png", "results/b/j/result.jpg")).toBe("image.jpg");
    });
  });

  describe("Endpoint: GET /api/jobs/:id/result-url", () => {
    it("returns presigned URL and expiresAt for completed job", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        originalFilename: "vacation.png",
        inputKey: `uploads/${batchId}/${jobId}/input.png`,
        outputKey: `results/${batchId}/${jobId}/result.jpg`,
        status: JobStatus.COMPLETED,
      } as any);

      const req: any = {
        params: { id: jobId },
        query: {},
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getJobResultUrlHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.body).toBeDefined();
      expect(res.body.url).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();

      const parsedUrl = new URL(res.body.url);
      const expectedHost = new URL(config.S3_PUBLIC_ENDPOINT).host;
      expect(parsedUrl.host).toBe(expectedHost);
      expect(parsedUrl.pathname).toContain(`results/${batchId}/${jobId}/result.jpg`);
      expect(parsedUrl.searchParams.get("response-content-disposition")).toBeNull();

      const diffSec = Math.round((new Date(res.body.expiresAt).getTime() - Date.now()) / 1000);
      expect(diffSec).toBeGreaterThanOrEqual(3590);
    });

    it("adds response-content-disposition attachment with original stem and result ext when ?download=1", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        originalFilename: "family-photo.png",
        inputKey: `uploads/${batchId}/${jobId}/input.png`,
        outputKey: `results/${batchId}/${jobId}/result.jpg`,
        status: JobStatus.COMPLETED,
      } as any);

      const req: any = {
        params: { id: jobId },
        query: { download: "1" },
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getJobResultUrlHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      const parsedUrl = new URL(res.body.url);
      expect(parsedUrl.searchParams.get("response-content-disposition")).toBe(
        'attachment; filename="family-photo.jpg"',
      );
    });

    it("encodes Vietnamese filenames with filename*=UTF-8'' and replaces non-ASCII in fallback", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        originalFilename: "ảnh gia đình.png",
        inputKey: `uploads/${batchId}/${jobId}/input.png`,
        outputKey: `results/${batchId}/${jobId}/result.jpg`,
        status: JobStatus.COMPLETED,
      } as any);

      const req: any = {
        params: { id: jobId },
        query: { download: "1" },
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getJobResultUrlHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      const parsedUrl = new URL(res.body.url);
      const disposition = parsedUrl.searchParams.get("response-content-disposition")!;
      expect(disposition).toBeDefined();
      expect(disposition).toContain("filename*=UTF-8''%E1%BA%A3nh%20gia%20%C4%91%C3%ACnh.jpg");
      // The ASCII fallback filename="..." must not contain raw non-ASCII characters
      const asciiMatch = disposition.match(/filename="([^"]+)"/);
      expect(asciiMatch).not.toBeNull();
      expect(/^[\x20-\x7E]+$/.test(asciiMatch![1])).toBe(true);
    });

    it("strips CR, LF, and control characters to prevent header injection", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        originalFilename: "exploit\r\nSet-Cookie:bad=1.png",
        inputKey: `uploads/${batchId}/${jobId}/input.png`,
        outputKey: `results/${batchId}/${jobId}/result.jpg`,
        status: JobStatus.COMPLETED,
      } as any);

      const req: any = {
        params: { id: jobId },
        query: { download: "1" },
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getJobResultUrlHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      const parsedUrl = new URL(res.body.url);
      const disposition = parsedUrl.searchParams.get("response-content-disposition")!;
      expect(disposition).not.toContain("\r");
      expect(disposition).not.toContain("\n");
      expect(disposition).toContain("exploitSet-Cookiebad");
      expect(disposition).toContain(".jpg");
    });

    it("returns 404 when job belongs to another user", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(null);

      const req: any = {
        params: { id: jobId },
        query: {},
        authUser: { id: otherUserId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getJobResultUrlHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          message: "Job not found",
        }),
      );
    });

    it("returns 404 when job has not completed yet (e.g. PROCESSING)", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        originalFilename: "photo.jpg",
        inputKey: `uploads/${batchId}/${jobId}/input.jpg`,
        outputKey: `results/${batchId}/${jobId}/result.jpg`,
        status: JobStatus.PROCESSING,
      } as any);

      const req: any = {
        params: { id: jobId },
        query: {},
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getJobResultUrlHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          message: "Job result not found",
        }),
      );
    });

    it("returns 404 when job has failed", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        originalFilename: "photo.jpg",
        inputKey: `uploads/${batchId}/${jobId}/input.jpg`,
        outputKey: `results/${batchId}/${jobId}/result.jpg`,
        status: JobStatus.FAILED,
      } as any);

      const req: any = {
        params: { id: jobId },
        query: {},
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getJobResultUrlHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          message: "Job result not found",
        }),
      );
    });
  });

  describe("Endpoint: GET /api/jobs/:id/original-url", () => {
    it("returns presigned URL and expiresAt with 5-min TTL and private no-store header", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        id: jobId,
        batchId,
        originalFilename: "raw-portrait.png",
        inputKey: `uploads/${batchId}/${jobId}/input.png`,
        outputKey: `results/${batchId}/${jobId}/result.jpg`,
        status: JobStatus.PROCESSING,
      } as any);

      const req: any = {
        params: { id: jobId },
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getJobOriginalUrlHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.body).toBeDefined();
      expect(res.body.url).toBeDefined();

      const parsedUrl = new URL(res.body.url);
      const expectedHost = new URL(config.S3_PUBLIC_ENDPOINT).host;
      expect(parsedUrl.host).toBe(expectedHost);
      expect(parsedUrl.pathname).toContain(`uploads/${batchId}/${jobId}/input.png`);
      expect(parsedUrl.searchParams.get("response-cache-control")).toBe("private, no-store");

      const diffSec = Math.round((new Date(res.body.expiresAt).getTime() - Date.now()) / 1000);
      expect(diffSec).toBeGreaterThanOrEqual(290);
      expect(diffSec).toBeLessThanOrEqual(310);
    });

    it("returns 404 when job belongs to another user", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(null);

      const req: any = {
        params: { id: jobId },
        authUser: { id: otherUserId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getJobOriginalUrlHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          message: "Job not found",
        }),
      );
    });
  });

  describe("Endpoint: GET /api/face-lists/:id/faces/:faceId/url", () => {
    it("returns presigned URL for allow list face with 5-min TTL and private no-store header", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "Allowed VIPs",
        keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.png`],
        createdAt: new Date(),
      } as any);

      const req: any = {
        params: { id: listId, faceId: "face-2" },
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getFaceUrlHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.body).toBeDefined();

      const parsedUrl = new URL(res.body.url);
      const expectedHost = new URL(config.S3_PUBLIC_ENDPOINT).host;
      expect(parsedUrl.host).toBe(expectedHost);
      expect(parsedUrl.pathname).toContain(`uploads/lists/${userId}/${listId}/face-2.png`);
      expect(parsedUrl.searchParams.get("response-cache-control")).toBe("private, no-store");

      const diffSec = Math.round((new Date(res.body.expiresAt).getTime() - Date.now()) / 1000);
      expect(diffSec).toBeGreaterThanOrEqual(290);
      expect(diffSec).toBeLessThanOrEqual(310);
    });

    it("returns 404 when face list belongs to another user", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue(null);

      const req: any = {
        params: { id: listId, faceId: "face-1" },
        authUser: { id: otherUserId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getFaceUrlHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          message: "Face list not found",
        }),
      );
    });

    it("returns 404 when faceId is not in the list", async () => {
      vi.spyOn(faceListRepository, "getFaceListOwnedByUser").mockResolvedValue({
        id: listId,
        userId,
        name: "Allowed VIPs",
        keys: [`lists/${userId}/${listId}/face-1.jpg`],
        createdAt: new Date(),
      } as any);

      const req: any = {
        params: { id: listId, faceId: "nonexistent-face" },
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getFaceUrlHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          message: "Face reference not found",
        }),
      );
    });
  });

  describe("Endpoint: GET /api/batches/:id/whitelist/:n/url", () => {
    it("returns presigned URL for batch's nth whitelist photo with 5-min TTL and private no-store header", async () => {
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
        id: batchId,
        userId,
        whitelistKeys: [`${batchId}/whitelist/face-1.jpg`, `${batchId}/whitelist/face-2.jpg`],
      } as any);

      const req: any = {
        params: { id: batchId, n: "2" },
        authUser: { id: userId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getBatchWhitelistPhotoUrlHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.body).toBeDefined();

      const parsedUrl = new URL(res.body.url);
      const expectedHost = new URL(config.S3_PUBLIC_ENDPOINT).host;
      expect(parsedUrl.host).toBe(expectedHost);
      expect(parsedUrl.pathname).toContain(`uploads/${batchId}/whitelist/face-2.jpg`);
      expect(parsedUrl.searchParams.get("response-cache-control")).toBe("private, no-store");

      const diffSec = Math.round((new Date(res.body.expiresAt).getTime() - Date.now()) / 1000);
      expect(diffSec).toBeGreaterThanOrEqual(290);
      expect(diffSec).toBeLessThanOrEqual(310);
    });

    it("returns 404 when batch belongs to another user", async () => {
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue(null);

      const req: any = {
        params: { id: batchId, n: "1" },
        authUser: { id: otherUserId },
      };
      const res = createMockResponse();
      const next = vi.fn();

      await getBatchWhitelistPhotoUrlHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          message: "Batch not found",
        }),
      );
    });

    it("returns 404 when n is out of range or malformed (including trailing chars like 1abc)", async () => {
      vi.spyOn(jobRepository, "getBatchOwnedByUser").mockResolvedValue({
        id: batchId,
        userId,
        whitelistKeys: [`${batchId}/whitelist/face-1.jpg`],
      } as any);

      for (const invalidN of ["0", "-1", "5", "abc", "1abc", "01abc"]) {
        const req: any = {
          params: { id: batchId, n: invalidN },
          authUser: { id: userId },
        };
        const res = createMockResponse();
        const next = vi.fn();

        await getBatchWhitelistPhotoUrlHandler(req, res, next);

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 404,
            message: "Whitelist photo not found",
          }),
        );
      }
    });
  });

  describe("Shared helper: buildAttachmentContentDisposition", () => {
    it("strips path traversal, quotes, colons, and control characters", () => {
      const header = buildAttachmentContentDisposition('../../path/to/my"file:name\r\n.jpg');
      expect(header).not.toContain("../");
      expect(header).not.toContain('"file:');
      expect(header).not.toContain("\r");
      expect(header).not.toContain("\n");
      expect(header).toContain("filename=");
    });

    it("creates RFC 5987 compliant header for Vietnamese characters", () => {
      const header = buildAttachmentContentDisposition("ảnh đại diện.png");
      expect(header).toContain("filename*=UTF-8''%E1%BA%A3nh%20%C4%91%E1%BA%A1i%20di%E1%BB%87n.png");
      expect(header).toMatch(/filename="[\x20-\x7e]+"/);
    });

    it("falls back to default fallback when stripped filename is empty", () => {
      expect(sanitizeAttachmentFilename("   ///???:::  ", "fallback.jpg")).toBe("fallback.jpg");
      const header = buildAttachmentContentDisposition("   ///???:::  ", "fallback.jpg");
      expect(header).toBe('attachment; filename="fallback.jpg"');
    });
  });

  describe("Task 88: Removed routes 404, library thumbnail signing, and polling resultUrl removal", () => {
    it("the removed streaming routes now return 404 NOT_FOUND", async () => {
      const app = createApp();
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as { port: number }).port;
      const headers = { Authorization: `Bearer ${createAccessToken({ id: userId, email: "user@example.com" })}` };

      try {
        const testUuid = "11111111-1111-4111-8111-111111111111";
        // 1. GET /api/jobs/:id/original
        const jobRes = await fetch(`http://127.0.0.1:${port}/api/jobs/${testUuid}/original`, { headers });
        expect(jobRes.status).toBe(404);
        const jobBody = (await jobRes.json()) as any;
        expect(jobBody.error.code).toBe("NOT_FOUND");

        // 2. GET /api/batches/:id/whitelist/:n
        const batchRes = await fetch(`http://127.0.0.1:${port}/api/batches/${testUuid}/whitelist/1`, { headers });
        expect(batchRes.status).toBe(404);
        const batchBody = (await batchRes.json()) as any;
        expect(batchBody.error.code).toBe("NOT_FOUND");

        // 3. GET /api/face-lists/:id/faces/:faceId
        const faceRes = await fetch(`http://127.0.0.1:${port}/api/face-lists/${testUuid}/faces/face-1`, { headers });
        expect(faceRes.status).toBe(404);
        const faceBody = (await faceRes.json()) as any;
        expect(faceBody.error.code).toBe("NOT_FOUND");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("GET /api/batches returns a signed thumbnailUrl for the first completed job", async () => {
      const mockBatches = [
        {
          id: batchId,
          name: "Family Album",
          startedAt: new Date("2026-11-04T10:00:00Z"),
          createdAt: new Date("2026-11-04T09:30:00Z"),
          jobs: [
            {
              id: "job-1",
              status: JobStatus.COMPLETED,
              inputBytes: 1500,
              resultBytes: 2500,
              outputKey: `results/${batchId}/job-1/result.jpg`,
              createdAt: new Date("2026-11-04T09:31:00Z"),
            },
          ],
        },
      ];

      vi.spyOn(jobRepository, "listBatchesByUserId").mockResolvedValue(mockBatches as any);
      vi.spyOn(jobRepository, "getAccountUsage").mockResolvedValue({ batches: 1, jobs: 1, bytes: 4000 });

      const presignSpy = vi.spyOn(storage, "presignGetUrl").mockResolvedValue({
        url: "http://localhost:9000/results/signed-thumbnail.jpg?X-Amz-Signature=123",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });

      const result = await listBatches(userId, { limit: 10 });
      expect(result.batches).toHaveLength(1);
      expect(result.batches[0].thumbnailUrl).toBe(
        "http://localhost:9000/results/signed-thumbnail.jpg?X-Amz-Signature=123",
      );
      expect(presignSpy).toHaveBeenCalledWith(
        RESULTS_BUCKET,
        `results/${batchId}/job-1/result.jpg`,
        expect.objectContaining({ ttlSeconds: config.PRESIGN_RESULT_TTL_SECONDS }),
      );
    });

    it("the polling route's jobs carry no resultUrl", async () => {
      const dummyJob = {
        id: jobId,
        batchId,
        originalFilename: "test.jpg",
        status: JobStatus.COMPLETED,
        progress: 100,
        stage: "COMPLETED",
        resultSummary: { faces: 1 },
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const jobDto = toJobResponse(dummyJob as any);
      expect(jobDto).toBeDefined();
      expect("resultUrl" in jobDto!).toBe(false);
      expect((jobDto as any).resultUrl).toBeUndefined();

      const batchDto = toBatchResponse(
        {
          id: batchId,
          name: "Test Batch",
          config: {},
          whitelistKeys: [],
          whitelistDeletedAt: null,
          startedAt: new Date(),
          createdAt: new Date(),
        } as any,
        [dummyJob as any],
      );

      expect(batchDto.jobs).toHaveLength(1);
      expect("resultUrl" in batchDto.jobs[0]).toBe(false);
      expect((batchDto.jobs[0] as any).resultUrl).toBeUndefined();
    });
  });
});
