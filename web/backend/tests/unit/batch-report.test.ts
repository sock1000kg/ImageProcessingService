import { describe, expect, it, vi } from "vitest";
import { toReportResponse } from "../../src/dto/batch.dto";

function reportInput(summary: unknown, status = "COMPLETED", extra: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    batchId: "batch-1",
    originalFilename: "photo.jpg",
    inputKey: "uploads/batch-1/photo.jpg",
    status,
    progress: status === "COMPLETED" ? 100 : 0,
    stage: null,
    resultUrl: null,
    resultSummary: summary,
    error: null,
    createdAt: new Date("2026-10-30T00:00:00Z"),
    updatedAt: new Date("2026-10-30T00:00:00Z"),
    ...extra,
  };
}

function batchInput(extra: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    name: "Batch 1",
    config: { similarityThreshold: 0.6 },
    whitelistKeys: [],
    whitelistDeletedAt: null,
    startedAt: new Date("2026-10-30T00:00:00Z"),
    createdAt: new Date("2026-10-30T00:00:00Z"),
    ...extra,
  };
}

describe("batch report review state", () => {
  it("reports low confidence, engine review, similarity proximity, and lowest redacted confidence", () => {
    const report = toReportResponse(batchInput() as never, [
      reportInput({
        detections: [
          { label: "face", confidence: 0.41, box: [1, 2, 3, 4], redacted: true, lowConfidence: true },
          { label: "face", confidence: 0.88, redacted: true, needsReview: true },
          { label: "plate", confidence: 0.8, redacted: true, similarity: 0.63 },
        ],
      }) as never,
    ]);

    expect(report.images[0]?.needsReview).toBe(true);
    expect(report.images[0]?.reviewReasons).toEqual([
      "Low confidence",
      "Engine reported needsReview",
      "Similarity near whitelist threshold",
    ]);
    expect(report.images[0]?.lowestRedactedConfidence).toBe(0.41);
    expect(report.reviewImages).toHaveLength(1);
    expect(report.reviewDetections).toHaveLength(3);
  });

  it("does not mark review when similarity is absent and keeps empty detections empty", () => {
    const report = toReportResponse(batchInput() as never, [reportInput({ detections: [] }) as never]);

    expect(report.images[0]?.needsReview).toBe(false);
    expect(report.images[0]?.reviewReasons).toEqual([]);
    expect(report.images[0]?.lowestRedactedConfidence).toBeNull();
    expect(report.reviewDetections).toHaveLength(0);
  });

  it("preserves failed report errors", () => {
    const job = reportInput(null, "FAILED");
    job.error = { code: "WORKER_CRASHED", message: "Worker stopped" };
    const report = toReportResponse(batchInput() as never, [job as never]);

    expect(report.totals.failed).toBe(1);
    expect(report.images[0]?.error).toEqual(job.error);
  });
});

describe("advanced batch report features (Task 30)", () => {
  it("deduplicates retries: one image, attempts: 2, totals.failed = 0", () => {
    const failedJob = reportInput(null, "FAILED", {
      id: "job-attempt-1",
      inputKey: "uploads/batch-1/img1.jpg",
      originalFilename: "img1.jpg",
      createdAt: new Date("2026-10-30T01:00:00Z"),
      error: { code: "RETRY_TRIGGERED", message: "Temporary failure" },
    });
    const completedJob = reportInput({ counts: { face: 1, redacted: 1 }, detections: [] }, "COMPLETED", {
      id: "job-attempt-2",
      inputKey: "uploads/batch-1/img1.jpg",
      originalFilename: "img1.jpg",
      createdAt: new Date("2026-10-30T01:05:00Z"),
    });

    const report = toReportResponse(batchInput() as never, [failedJob as never, completedJob as never]);

    expect(report.totals.images).toBe(1);
    expect(report.totals.completed).toBe(1);
    expect(report.totals.failed).toBe(0);
    expect(report.images).toHaveLength(1);
    expect(report.images[0]?.jobId).toBe("job-attempt-2");
    expect(report.images[0]?.attempts).toBe(2);
    expect(report.failedImages).toHaveLength(0);
  });

  it("handles whitelist people summary: one person in 2 images and one in none", () => {
    const batch = batchInput({
      whitelistKeys: ["uploads/batch-1/whitelist/person0.jpg", "uploads/batch-1/whitelist/person1.jpg"],
    });

    const job1 = reportInput(
      {
        detections: [
          {
            label: "face",
            confidence: 0.95,
            redacted: false,
            whitelisted: true,
            whitelistRef: 0,
            similarity: 0.85,
          },
        ],
      },
      "COMPLETED",
      { id: "job-1", originalFilename: "img1.jpg", inputKey: "uploads/batch-1/img1.jpg" },
    );

    const job2 = reportInput(
      {
        detections: [
          {
            label: "face",
            confidence: 0.9,
            redacted: false,
            whitelisted: true,
            whitelistRef: 0,
            similarity: 0.8,
          },
          {
            label: "face",
            confidence: 0.92,
            redacted: false,
            whitelisted: true,
            whitelistRef: 0,
            similarity: 0.82,
          },
        ],
      },
      "COMPLETED",
      { id: "job-2", originalFilename: "img2.jpg", inputKey: "uploads/batch-1/img2.jpg" },
    );

    const job3 = reportInput({ detections: [] }, "COMPLETED", {
      id: "job-3",
      originalFilename: "img3.jpg",
      inputKey: "uploads/batch-1/img3.jpg",
    });

    const report = toReportResponse(batch as never, [job1 as never, job2 as never, job3 as never]);

    expect(report.whitelistPeople).toHaveLength(2);

    const person0 = report.whitelistPeople[0];
    expect(person0).toEqual({
      whitelistRef: 0,
      whitelistKey: "uploads/batch-1/whitelist/person0.jpg",
      images: [
        { jobId: "job-1", originalFilename: "img1.jpg" },
        { jobId: "job-2", originalFilename: "img2.jpg" },
      ],
      imageCount: 2,
      detectionCount: 3,
    });

    const person1 = report.whitelistPeople[1];
    expect(person1).toEqual({
      whitelistRef: 1,
      whitelistKey: "uploads/batch-1/whitelist/person1.jpg",
      images: [],
      imageCount: 0,
      detectionCount: 0,
    });
  });

  it("ignores an out-of-range whitelistRef and logs a console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const batch = batchInput({
      whitelistKeys: ["uploads/batch-1/whitelist/person0.jpg"],
    });

    const job = reportInput({
      detections: [
        {
          label: "face",
          confidence: 0.9,
          whitelisted: true,
          whitelistRef: 99,
          similarity: 0.8,
        },
      ],
    });

    const report = toReportResponse(batch as never, [job as never]);

    expect(warnSpy).toHaveBeenCalled();
    expect(report.whitelistPeople).toHaveLength(1);
    expect(report.whitelistPeople[0]?.detectionCount).toBe(0);
    expect(report.whitelistPeople[0]?.imageCount).toBe(0);

    warnSpy.mockRestore();
  });

  it("builds note texts with values and prioritizes kept-face notes first", () => {
    const batch = batchInput({
      config: { similarityThreshold: 0.6 },
    });

    const job = reportInput({
      detections: [
        {
          label: "face",
          confidence: 0.41,
          lowConfidence: true,
          redacted: true,
        },
        {
          label: "face",
          confidence: 0.85,
          whitelisted: true,
          similarity: 0.62,
        },
        {
          label: "face",
          confidence: 0.88,
          whitelisted: false,
          redacted: true,
          similarity: 0.58,
        },
        {
          label: "plate",
          needsReview: true,
        },
      ],
    });

    const report = toReportResponse(batch as never, [job as never]);
    const img = report.images[0];
    expect(img).toBeDefined();

    // Verify detection notes
    expect(img?.detections[0]?.reviewNotes).toEqual(["low confidence 0.41"]);
    expect(img?.detections[1]?.reviewNotes).toEqual([
      "kept face near whitelist threshold (similarity 0.62, threshold 0.60)",
    ]);
    expect(img?.detections[2]?.reviewNotes).toEqual([
      "redacted face near whitelist threshold (similarity 0.58, threshold 0.60)",
    ]);
    expect(img?.detections[3]?.reviewNotes).toEqual(["engine flagged for review"]);

    // Verify image notes: kept-face note MUST come first
    expect(img?.reviewNotes).toEqual([
      "kept face near whitelist threshold (similarity 0.62, threshold 0.60)",
      "low confidence 0.41",
      "redacted face near whitelist threshold (similarity 0.58, threshold 0.60)",
      "engine flagged for review",
    ]);

    // Existing reviewReasons should remain unchanged
    expect(img?.reviewReasons).toEqual([
      "Low confidence",
      "Similarity near whitelist threshold",
      "Engine reported needsReview",
    ]);
  });

  it("sorts images across all five groups in specified order", () => {
    const batch = batchInput({
      config: { similarityThreshold: 0.6 },
    });

    // Group 1: needsReview = true, lowestRedactedConfidence != null
    const jobG1A = reportInput(
      {
        detections: [{ label: "face", confidence: 0.5, redacted: true, lowConfidence: true }],
      },
      "COMPLETED",
      { id: "j-g1-a", inputKey: "k-g1-a", originalFilename: "z-g1-conf50.jpg" },
    );
    const jobG1B = reportInput(
      {
        detections: [{ label: "face", confidence: 0.35, redacted: true, lowConfidence: true }],
      },
      "COMPLETED",
      { id: "j-g1-b", inputKey: "k-g1-b", originalFilename: "a-g1-conf35.jpg" },
    );

    // Group 2: needsReview = true, lowestRedactedConfidence = null (only kept face near threshold)
    const jobG2 = reportInput(
      {
        detections: [{ label: "face", whitelisted: true, similarity: 0.62 }],
      },
      "COMPLETED",
      { id: "j-g2", inputKey: "k-g2", originalFilename: "m-g2-kept.jpg" },
    );

    // Group 3: needsReview = false, lowestRedactedConfidence != null
    const jobG3 = reportInput(
      {
        detections: [{ label: "face", confidence: 0.95, redacted: true, lowConfidence: false }],
      },
      "COMPLETED",
      { id: "j-g3", inputKey: "k-g3", originalFilename: "b-g3-highconf.jpg" },
    );

    // Group 4: needsReview = false, lowestRedactedConfidence = null (no detections)
    const jobG4 = reportInput({ detections: [] }, "COMPLETED", {
      id: "j-g4",
      inputKey: "k-g4",
      originalFilename: "c-g4-nodet.jpg",
    });

    // Group 5: FAILED image
    const jobG5 = reportInput(null, "FAILED", {
      id: "j-g5",
      inputKey: "k-g5",
      originalFilename: "d-g5-failed.jpg",
      error: { code: "CRASH", message: "Worker error" },
    });

    // Provide jobs in shuffled order
    const report = toReportResponse(batch as never, [
      jobG5 as never,
      jobG3 as never,
      jobG1A as never,
      jobG4 as never,
      jobG2 as never,
      jobG1B as never,
    ]);

    const filenames = report.images.map((img) => img.originalFilename);
    expect(filenames).toEqual([
      "a-g1-conf35.jpg", // Group 1 (conf 0.35)
      "z-g1-conf50.jpg", // Group 1 (conf 0.50)
      "m-g2-kept.jpg", // Group 2 (needsReview, conf null)
      "b-g3-highconf.jpg", // Group 3 (no review, conf 0.95)
      "c-g4-nodet.jpg", // Group 4 (no review, conf null)
      "d-g5-failed.jpg", // Group 5 (FAILED)
    ]);

    // reviewImages follows the same image order
    expect(report.reviewImages.map((r) => r.originalFilename)).toEqual([
      "a-g1-conf35.jpg",
      "z-g1-conf50.jpg",
      "m-g2-kept.jpg",
    ]);

    // lowConfidenceDetections follows the same image order
    expect(report.lowConfidenceDetections.map((d) => d.originalFilename)).toEqual([
      "a-g1-conf35.jpg",
      "z-g1-conf50.jpg",
    ]);
  });

  it("lists failedImages with code, message, and attempts", () => {
    const failedJob = reportInput(null, "FAILED", {
      id: "job-fail-1",
      inputKey: "uploads/batch-1/corrupt.png",
      originalFilename: "corrupt.png",
      error: { code: "DECODE_ERROR", message: "Corrupted PNG header" },
    });

    const report = toReportResponse(batchInput() as never, [failedJob as never]);

    expect(report.failedImages).toEqual([
      {
        jobId: "job-fail-1",
        originalFilename: "corrupt.png",
        code: "DECODE_ERROR",
        message: "Corrupted PNG header",
        attempts: 1,
      },
    ]);
  });

  it("collects batch-level models and processingTimeMs for completed attempts", () => {
    const job1 = reportInput({ model: "yolov8m", processingTimeMs: 120 }, "COMPLETED", {
      id: "j-1",
      inputKey: "k-1",
      originalFilename: "img1.jpg",
    });
    const job2 = reportInput({ model: "yolov8n-oiv7", processingTimeMs: 180 }, "COMPLETED", {
      id: "j-2",
      inputKey: "k-2",
      originalFilename: "img2.jpg",
    });
    const job3 = reportInput({ model: "yolov8m", processingTimeMs: 150 }, "COMPLETED", {
      id: "j-3",
      inputKey: "k-3",
      originalFilename: "img3.jpg",
    });
    const jobFail = reportInput({ model: "should-not-appear", processingTimeMs: 999 }, "FAILED", {
      id: "j-4",
      inputKey: "k-4",
      originalFilename: "img4.jpg",
    });

    const report = toReportResponse(batchInput() as never, [
      job1 as never,
      job2 as never,
      job3 as never,
      jobFail as never,
    ]);

    expect(report.models).toEqual(["yolov8m", "yolov8n-oiv7"]);
    expect(report.processingTimeMs).toEqual({
      total: 450,
      mean: 150,
      max: 180,
    });
  });

  it("returns processingTimeMs null when no processing times are reported", () => {
    const job = reportInput({}, "COMPLETED", { id: "j-1", inputKey: "k-1" });
    const report = toReportResponse(batchInput() as never, [job as never]);

    expect(report.models).toEqual([]);
    expect(report.processingTimeMs).toBeNull();
  });
});
