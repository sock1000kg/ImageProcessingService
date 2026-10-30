import { describe, expect, it } from "vitest";
import { buildBatchFormData } from "../src/api";
import { getFileIdentity, getFolderName, validateImageFiles } from "../src/components/file-selection";
import { sortBatchJobs } from "../src/components/BatchImageList";

describe("Frontend Batch Form Data Builder", () => {
  it("builds FormData containing files, whitelist, and serialized config", () => {
    const file1 = new File(["test1"], "image1.jpg", { type: "image/jpeg" });
    const file2 = new File(["test2"], "image2.png", { type: "image/png" });
    const faceRef = new File(["ref"], "face-ref.jpg", { type: "image/jpeg" });

    const config = {
      targets: ["face", "plate"],
      style: "pixelate",
      strength: 12,
      quality: "high",
      format: "original",
    };

    const formData = buildBatchFormData([file1, file2], [faceRef], config);

    expect(formData.getAll("files")).toHaveLength(2);
    expect(formData.getAll("whitelist")).toHaveLength(1);
    expect(formData.get("config")).toBe(JSON.stringify(config));
  });

  it("handles empty whitelist correctly", () => {
    const file = new File(["content"], "photo.webp", { type: "image/webp" });
    const config = { style: "blur" };

    const formData = buildBatchFormData([file], [], config);
    expect(formData.getAll("files")).toHaveLength(1);
    expect(formData.getAll("whitelist")).toHaveLength(0);
    expect(formData.get("config")).toBe(JSON.stringify(config));
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
});
