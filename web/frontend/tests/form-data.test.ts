import { describe, expect, it, vi, beforeEach } from "vitest";
import { renameBatch, uploadBatch, UploadProgress } from "../src/api";
import { getFileIdentity, getFolderName, validateImageFiles } from "../src/components/file-selection";
import { sortBatchJobs } from "../src/components/BatchImageList";

describe("Frontend Batch Upload and Validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uploadBatch: creates draft, uploads files 2 at a time, and starts batch when all succeed", async () => {
    const file1 = new File(["test1"], "image1.jpg", { type: "image/jpeg" });
    const file2 = new File(["test2"], "image2.png", { type: "image/png" });
    const faceRef = new File(["ref"], "face-ref.jpg", { type: "image/jpeg" });
    const config = { targets: ["face"], style: "blur" };

    const fetchCalls: Array<{ url: string; method?: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, method: init?.method });
        if (url === "/api/batches" && init?.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              batch: { id: "test-batch-1", status: "DRAFT", config, whitelistKeys: [], whitelistDeletedAt: null, createdAt: new Date().toISOString(), jobs: [] },
            }),
          };
        }
        if (url.includes("/files") && init?.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              job: { id: "job-" + Math.random(), originalFilename: "img", status: "PENDING" },
            }),
          };
        }
        if (url === "/api/batches/test-batch-1/start" && init?.method === "POST") {
          return {
            ok: true,
            status: 202,
            json: async () => ({
              batch: { id: "test-batch-1", status: "PROCESSING", config, whitelistKeys: [], whitelistDeletedAt: null, createdAt: new Date().toISOString(), jobs: [] },
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({ error: { message: "Not found" } }) };
      }),
    );

    const progressReports: UploadProgress[] = [];
    const result = await uploadBatch(
      [file1, file2],
      [faceRef],
      config,
      (p) => progressReports.push(p),
    );

    expect(result.failed).toHaveLength(0);
    expect(result.batch.status).toBe("PROCESSING");
    expect(fetchCalls.some((c) => c.url === "/api/batches" && c.method === "POST")).toBe(true);
    expect(fetchCalls.filter((c) => c.url.includes("/files")).length).toBe(2);
    expect(fetchCalls.some((c) => c.url.includes("/start") && c.method === "POST")).toBe(true);
    expect(progressReports.length).toBe(2);
    expect(progressReports[1].done).toBe(2);
  });

  it("uploadBatch: when one file fails twice, failed has it and start is not called", async () => {
    const file1 = new File(["test1"], "image1.jpg", { type: "image/jpeg" });
    const file2 = new File(["test2"], "image2.png", { type: "image/png" });
    const config = { targets: ["face"], style: "blur" };

    const fetchCalls: Array<{ url: string; method?: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, method: init?.method });
        if (url === "/api/batches" && init?.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              batch: { id: "test-batch-fail", status: "DRAFT", config, whitelistKeys: [], whitelistDeletedAt: null, createdAt: new Date().toISOString(), jobs: [] },
            }),
          };
        }
        if (url.includes("/files") && init?.method === "POST") {
          const body = init?.body as FormData;
          const file = body?.get("file") as File;
          // file2 fails on every attempt
          if (file?.name === "image2.png") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: { message: "Simulated upload failure" } }),
            };
          }
          return {
            ok: true,
            status: 201,
            json: async () => ({
              job: { id: "job-1", originalFilename: file?.name, status: "PENDING" },
            }),
          };
        }
        if (url.includes("/start") && init?.method === "POST") {
          return {
            ok: true,
            status: 202,
            json: async () => ({ batch: { id: "test-batch-fail", status: "PROCESSING" } }),
          };
        }
        return { ok: false, status: 404, json: async () => ({ error: { message: "Not found" } }) };
      }),
    );

    const progressReports: UploadProgress[] = [];
    const result = await uploadBatch(
      [file1, file2],
      [],
      config,
      (p) => progressReports.push(p),
    );

    // image2 failed twice (1 attempt + 1 retry)
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].name).toBe("image2.png");
    // Start must NOT be called
    expect(fetchCalls.some((c) => c.url.includes("/start"))).toBe(false);
  });

  it("accepts supported images and rejects unsupported or oversized files", () => {
    const valid = new File(["content"], "photo.webp", { type: "image/webp" });
    const invalid = new File(["content"], "photo.gif", { type: "image/gif" });
    const oversized = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });

    expect(validateImageFiles([valid])).toHaveLength(0);
    expect(validateImageFiles([invalid, oversized]).map((issue) => issue.file.name)).toEqual(["photo.gif", "large.jpg"]);
  });

  it("preserves folder paths and duplicate names as distinct files", () => {
    const first = new File(["a"], "photo.jpg", { type: "image/jpeg", lastModified: 1 });
    const second = new File(["b"], "photo.jpg", { type: "image/jpeg", lastModified: 1 });
    Object.defineProperty(first, "webkitRelativePath", { value: "holiday/day-one/photo.jpg" });
    Object.defineProperty(second, "webkitRelativePath", { value: "holiday/day-two/photo.jpg" });

    expect(getFolderName([first, second])).toBe("holiday");
    expect(getFileIdentity(first)).not.toBe(getFileIdentity(second));
  });

  it("does not silently trim a selection over the batch limit", () => {
    const files = Array.from({ length: 21 }, (_, index) =>
      new File([String(index)], `photo-${index}.jpg`, { type: "image/jpeg" }),
    );

    expect(files).toHaveLength(21);
    expect(validateImageFiles(files)).toHaveLength(0);
  });

  it("sorts failed, review, low-confidence, then remaining jobs", () => {
    const jobs = ["normal", "review", "failed", "low"].map((id, index) => ({
      id,
      originalFilename: `${id}.jpg`,
      status: id === "failed" ? "FAILED" : "COMPLETED",
      progress: 100,
      stage: "DONE",
      resultUrl: null,
      resultSummary: null,
      error: null,
      createdAt: new Date(2026, 9, 30, 0, index).toISOString(),
      updatedAt: new Date(2026, 9, 30, 0, index).toISOString(),
    }));
    const report = [
      { jobId: "review", needsReview: true, lowestRedactedConfidence: 0.7 },
      { jobId: "low", needsReview: false, lowestRedactedConfidence: 0.2 },
    ];

    expect(sortBatchJobs({ jobs } as never, report as never).map((job) => job.id)).toEqual([
      "failed",
      "review",
      "low",
      "normal",
    ]);
  });

  describe("Folder name helper (single folder, mixed folders, plain files)", () => {
    it("returns top folder name when all files come from a single folder", () => {
      const f1 = new File(["1"], "photo1.jpg", { type: "image/jpeg" });
      const f2 = new File(["2"], "photo2.jpg", { type: "image/jpeg" });
      const f3 = new File(["3"], "photo3.jpg", { type: "image/jpeg" });
      Object.defineProperty(f1, "webkitRelativePath", { value: "vacation/sub/photo1.jpg" });
      Object.defineProperty(f2, "webkitRelativePath", { value: "vacation/photo2.jpg" });
      Object.defineProperty(f3, "webkitRelativePath", { value: "vacation/deep/nested/photo3.jpg" });

      expect(getFolderName([f1, f2, f3])).toBe("vacation");
    });

    it("returns null when files come from mixed folders", () => {
      const f1 = new File(["1"], "photo1.jpg", { type: "image/jpeg" });
      const f2 = new File(["2"], "photo2.jpg", { type: "image/jpeg" });
      Object.defineProperty(f1, "webkitRelativePath", { value: "folderA/photo1.jpg" });
      Object.defineProperty(f2, "webkitRelativePath", { value: "folderB/photo2.jpg" });

      expect(getFolderName([f1, f2])).toBeNull();
    });

    it("returns null when files are plain files without folder path", () => {
      const f1 = new File(["1"], "plain1.jpg", { type: "image/jpeg" });
      const f2 = new File(["2"], "plain2.png", { type: "image/png" });

      expect(getFolderName([f1, f2])).toBeNull();
    });

    it("returns null when selection mixes folder files and plain files", () => {
      const f1 = new File(["1"], "photo1.jpg", { type: "image/jpeg" });
      const f2 = new File(["2"], "plain2.jpg", { type: "image/jpeg" });
      Object.defineProperty(f1, "webkitRelativePath", { value: "my-folder/photo1.jpg" });

      expect(getFolderName([f1, f2])).toBeNull();
    });
  });

  describe("Batch Rename API client (Task 28)", () => {
    it("renameBatch sends PATCH request with JSON { name }", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      let capturedHeaders: any = {};
      let capturedBody = "";

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
          capturedUrl = url;
          capturedMethod = init?.method ?? "";
          capturedHeaders = init?.headers;
          capturedBody = String(init?.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: { id: "test-batch-rename", name: "New Batch Name", status: "PROCESSING" },
            }),
          };
        }),
      );

      const res = await renameBatch("test-batch-rename", "New Batch Name");
      expect(capturedUrl).toBe("/api/batches/test-batch-rename");
      expect(capturedMethod).toBe("PATCH");
      expect(capturedHeaders["Content-Type"]).toBe("application/json");
      expect(JSON.parse(capturedBody)).toEqual({ name: "New Batch Name" });
      expect(res.batch.name).toBe("New Batch Name");
    });

    it("uploadBatch includes name in createDraftBatch when provided", async () => {
      const file1 = new File(["test1"], "image1.jpg", { type: "image/jpeg" });
      let capturedFormData: FormData | null = null;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
          if (url === "/api/batches" && init?.method === "POST") {
            capturedFormData = init?.body as FormData;
            return {
              ok: true,
              status: 201,
              json: async () => ({
                batch: { id: "batch-name-1", name: "Custom Name", status: "DRAFT" },
              }),
            };
          }
          if (url.includes("/files")) {
            return {
              ok: true,
              status: 201,
              json: async () => ({
                job: { id: "job-1", originalFilename: "image1.jpg", status: "PENDING" },
              }),
            };
          }
          if (url.includes("/start")) {
            return {
              ok: true,
              status: 202,
              json: async () => ({
                batch: { id: "batch-name-1", name: "Custom Name", status: "PROCESSING" },
              }),
            };
          }
          return { ok: false, status: 404, json: async () => ({ error: { message: "Not found" } }) };
        }),
      );

      const result = await uploadBatch(
        [file1],
        [],
        { targets: ["face"] },
        undefined,
        undefined,
        "Custom Name",
      );

      expect(capturedFormData?.get("name")).toBe("Custom Name");
      expect(result.batch.name).toBe("Custom Name");
    });
  });
});
