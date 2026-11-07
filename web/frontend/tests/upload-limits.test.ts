/**
 * Unit tests verifying rate-limit backoff (429) and batch capacity limits (409 BATCH_FULL) in uploadBatch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, uploadBatch, UploadProgress } from "../src/api";

describe("uploadBatch limits and rate-limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("429 with Retry-After: 2 followed by success uploads file with failed empty, reporting waitSeconds > 0 then 0", async () => {
    const file = new File(["payload"], "sample.jpg", { type: "image/jpeg" });
    const config = { targets: ["face"], style: "blur" };

    let fileUploadAttempts = 0;
    const fetchCalls: Array<{ url: string; method?: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, method: init?.method });

        // 1. Create draft batch
        if (url === "/api/batches" && init?.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              batch: {
                id: "batch-429",
                status: "DRAFT",
                config,
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
                jobs: [],
              },
            }),
          };
        }

        // 2. Upload file
        if (url.includes("/files") && init?.method === "POST") {
          fileUploadAttempts++;
          if (fileUploadAttempts === 1) {
            // First attempt hits 429 Too Many Requests with Retry-After: 2 header
            return {
              ok: false,
              status: 429,
              headers: new Headers({ "Retry-After": "2" }),
              json: async () => ({
                error: { code: "RATE_LIMITED", message: "Rate limit exceeded" },
              }),
            };
          }

          // Second attempt succeeds
          return {
            ok: true,
            status: 201,
            json: async () => ({
              job: { id: "job-1", originalFilename: "sample.jpg", status: "PENDING" },
            }),
          };
        }

        // 3. Start batch
        if (url.includes("/start") && init?.method === "POST") {
          return {
            ok: true,
            status: 202,
            json: async () => ({
              batch: {
                id: "batch-429",
                status: "PROCESSING",
                config,
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
                jobs: [],
              },
            }),
          };
        }

        return { ok: false, status: 404, json: async () => ({ error: { message: "Not found" } }) };
      }),
    );

    const progressReports: UploadProgress[] = [];
    const uploadPromise = uploadBatch([file], [], config, (p) => {
      progressReports.push({ ...p });
    });

    // Advance fake timers by 1s (tick 1 of 2)
    await vi.advanceTimersByTimeAsync(1000);
    // Advance fake timers by 1s (cooldown expires, resumes)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await uploadPromise;

    expect(fileUploadAttempts).toBe(2);
    expect(result.failed).toHaveLength(0);
    expect(result.batch.status).toBe("PROCESSING");

    // Progress updates include waitSeconds > 0 while paused, then waitSeconds: 0 upon resume
    const positiveWaitReports = progressReports.filter((p) => (p.waitSeconds ?? 0) > 0);
    const resumeReports = progressReports.filter((p) => p.waitSeconds === 0);
    expect(positiveWaitReports.length).toBeGreaterThanOrEqual(1);
    expect(resumeReports.length).toBeGreaterThanOrEqual(1);
    expect(fetchCalls.some((c) => c.url.includes("/start"))).toBe(true);
  });

  it("409 BATCH_FULL after N files returns remaining files in failed with limitReason and makes no further requests", async () => {
    const file1 = new File(["content1"], "image1.jpg", { type: "image/jpeg" });
    const file2 = new File(["content2"], "image2.jpg", { type: "image/jpeg" });
    const file3 = new File(["content3"], "image3.jpg", { type: "image/jpeg" });
    const config = { targets: ["face"], style: "blur" };

    const fileUploadCalls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/batches" && init?.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              batch: {
                id: "batch-full",
                status: "DRAFT",
                config,
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
                jobs: [],
              },
            }),
          };
        }

        if (url.includes("/files") && init?.method === "POST") {
          const body = init?.body as FormData;
          const file = body?.get("file") as File;
          fileUploadCalls.push(file.name);

          // First file succeeds (N = 1 file uploaded)
          if (file.name === "image1.jpg") {
            return {
              ok: true,
              status: 201,
              json: async () => ({
                job: { id: "job-1", originalFilename: file.name, status: "PENDING" },
              }),
            };
          }

          // Second file hits 409 BATCH_FULL
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: "BATCH_FULL",
                message: "Batch has reached maximum capacity of 1000 files.",
              },
            }),
          };
        }

        return { ok: false, status: 404, json: async () => ({ error: { message: "Not found" } }) };
      }),
    );

    const progressReports: UploadProgress[] = [];
    const result = await uploadBatch([file1, file2, file3], [], config, (p) => {
      progressReports.push({ ...p });
    });

    // image2 received BATCH_FULL; image3 was never started. Both are in failed.
    expect(result.failed.map((f) => f.name)).toEqual(["image2.jpg", "image3.jpg"]);
    expect(result.limitReason).toContain("Batch has reached maximum capacity of 1000 files.");
    // No upload request was ever sent for image3.jpg
    expect(fileUploadCalls).not.toContain("image3.jpg");
    // Only image1.jpg finished
    expect(progressReports.some((p) => p.done === 1)).toBe(true);
  });

  it("500 twice puts that one file in failed, and the other files still upload", async () => {
    const file1 = new File(["data1"], "good1.jpg", { type: "image/jpeg" });
    const file2 = new File(["data2"], "broken.jpg", { type: "image/jpeg" });
    const file3 = new File(["data3"], "good2.jpg", { type: "image/jpeg" });
    const config = { targets: ["face"], style: "blur" };

    const attemptsPerFile: Record<string, number> = {
      "good1.jpg": 0,
      "broken.jpg": 0,
      "good2.jpg": 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/batches" && init?.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              batch: {
                id: "batch-500",
                status: "DRAFT",
                config,
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
                jobs: [],
              },
            }),
          };
        }

        if (url.includes("/files") && init?.method === "POST") {
          const body = init?.body as FormData;
          const file = body?.get("file") as File;
          attemptsPerFile[file.name] = (attemptsPerFile[file.name] ?? 0) + 1;

          if (file.name === "broken.jpg") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: { message: "Internal server error" } }),
            };
          }

          return {
            ok: true,
            status: 201,
            json: async () => ({
              job: { id: `job-${file.name}`, originalFilename: file.name, status: "PENDING" },
            }),
          };
        }

        return { ok: false, status: 404, json: async () => ({ error: { message: "Not found" } }) };
      }),
    );

    const result = await uploadBatch([file1, file2, file3], [], config);

    // broken.jpg was attempted twice (initial + 1 retry) and failed
    expect(attemptsPerFile["broken.jpg"]).toBe(2);
    // good1 and good2 were attempted and uploaded successfully
    expect(attemptsPerFile["good1.jpg"]).toBe(1);
    expect(attemptsPerFile["good2.jpg"]).toBe(1);

    expect(result.failed.map((f) => f.name)).toEqual(["broken.jpg"]);
    expect(result.limitReason).toBeUndefined();
  });

  it("emits waitSeconds === 0 on final progress when a 429 pause is cut short by BATCH_FULL", async () => {
    const file1 = new File(["1"], "file1.jpg", { type: "image/jpeg" });
    const file2 = new File(["2"], "file2.jpg", { type: "image/jpeg" });
    const config = { targets: ["face"], style: "blur" };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/batches" && init?.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              batch: {
                id: "batch-cut-short",
                status: "DRAFT",
                config,
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
                jobs: [],
              },
            }),
          };
        }

        if (url.includes("/files") && init?.method === "POST") {
          const body = init?.body as FormData;
          const file = body?.get("file") as File;

          // file1 hits 429 and enters pause cooldown
          if (file.name === "file1.jpg") {
            return {
              ok: false,
              status: 429,
              headers: new Headers({ "Retry-After": "8" }),
              json: async () => ({
                error: { code: "RATE_LIMITED", message: "Upload speed exceeded" },
              }),
            };
          }

          // file2 hits 409 BATCH_FULL, cutting short the active pause
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: "BATCH_FULL",
                message: "Batch limit exceeded (maximum 1000 files).",
              },
            }),
          };
        }

        return { ok: false, status: 404, json: async () => ({ error: { message: "Not found" } }) };
      }),
    );

    const progressReports: UploadProgress[] = [];
    const result = await uploadBatch([file1, file2], [], config, (p) => {
      progressReports.push({ ...p });
    });

    expect(result.limitReason).toContain("Batch limit exceeded");
    // Ensure pause started with waitSeconds > 0
    expect(progressReports.some((p) => (p.waitSeconds ?? 0) > 0)).toBe(true);
    // After the pause is cut short by BATCH_FULL, the last progress update must have waitSeconds === 0
    const lastReport = progressReports[progressReports.length - 1];
    expect(lastReport.waitSeconds).toBe(0);
  });
});
