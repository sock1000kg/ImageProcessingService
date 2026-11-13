import { describe, expect, it, vi } from "vitest";
import { toReportResponse } from "../../src/dto/report.dto";

function reportInput(summary: unknown, status = "COMPLETED", extra: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    batchId: "batch-1",
    originalFilename: "photo.jpg",
    inputKey: "uploads/batch-1/photo.jpg",
    status,
    progress: status === "COMPLETED" ? 100 : 0,
    stage: null,
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
          { label: "face", confidence: 0.41, box: [10, 20, 50, 60], redacted: true, lowConfidence: true },
          { label: "face", confidence: 0.88, redacted: true, needsReview: true },
          { label: "plate", confidence: 0.8, redacted: true, similarity: 0.63 },
        ],
      }) as never,
    ]);

    expect(report.images[0]?.needsReview).toBe(true);
    expect(report.images[0]?.reviewReasons).toEqual([
      "Low confidence",
      "Engine reported needsReview",
      "Similarity near allow list threshold",
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

  it("reports a video's tracks: low confidence stretches and gaps flag it for review, except tiny faces, brief flickers and one-frame dips", () => {
    const video = reportInput(
      {
        video: { width: 1920, height: 1080 },
        counts: { faceTracks: 3, lowConfidenceTracks: 1, redactedTracks: 3 },
        tracks: [
          {
            trackId: 1,
            label: "face",
            box: [10, 10, 60, 60],
            startMs: 0,
            endMs: 3000,
            redacted: true,
            whitelisted: false,
            meanConfidence: 0.7,
            lowConfidenceRanges: [[2000, 3000]],
            gapRanges: [],
          },
          {
            trackId: 2,
            label: "face",
            box: [10, 10, 60, 60],
            startMs: 5000,
            endMs: 9000,
            redacted: true,
            whitelisted: false,
            meanConfidence: 0.8,
            lowConfidenceRanges: [],
            gapRanges: [[6000, 7000]],
          },
          {
            trackId: 3,
            label: "face",
            box: [10, 10, 60, 60],
            startMs: 0,
            endMs: 9000,
            redacted: true,
            whitelisted: false,
            meanConfidence: 0.9,
            lowConfidenceRanges: [],
            gapRanges: [],
          },
          {
            trackId: 5,
            label: "face",
            box: [0, 0, 80, 80],
            startMs: 0,
            endMs: 300,
            redacted: true,
            whitelisted: false,
            meanConfidence: 0.2,
            lowConfidenceRanges: [[0, 300]],
            gapRanges: [],
          },
          {
            trackId: 6,
            label: "face",
            box: [0, 0, 80, 80],
            startMs: 0,
            endMs: 4000,
            redacted: true,
            whitelisted: false,
            meanConfidence: 0.6,
            lowConfidenceRanges: [[1000, 1100]],
            gapRanges: [],
          },
          {
            trackId: 4,
            label: "face",
            box: [0, 0, 8, 8],
            startMs: 0,
            endMs: 500,
            redacted: true,
            whitelisted: false,
            meanConfidence: 0.2,
            lowConfidenceRanges: [[0, 500]],
            gapRanges: [[100, 200]],
          },
        ],
      },
      "COMPLETED",
      { id: "vid-1", originalFilename: "street.mp4", inputKey: "uploads/batch-1/street.mp4" },
    );

    const report = toReportResponse(batchInput() as never, [video as never]);

    expect(report.totals.faces).toBe(3);
    expect(report.totals.lowConfidence).toBe(1);
    expect(report.reviewImages.map((image) => image.jobId)).toEqual(["vid-1"]);
    const flagged = report.reviewDetections.map((detection) => [detection.trackId, detection.startMs, detection.endMs]);
    expect(flagged).toEqual([
      [1, 0, 3000],
      [2, 5000, 9000],
    ]);
    expect(report.reviewDetections[1]?.reviewNotes.join(" ")).toMatch(/0:06.0–0:07.0/);
    expect(report.reviewDetections[1]?.reviewReasons).toEqual(["Possible redaction gap"]);
    expect(report.reviewDetections[0]?.reviewNotes.join(" ")).toMatch(/low confidence at 0:02.0–0:03.0/);
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
      name: null,
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
      name: null,
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
      "kept face near allow list threshold (similarity 0.62, threshold 0.60)",
    ]);
    expect(img?.detections[2]?.reviewNotes).toEqual([
      "redacted face near allow list threshold (similarity 0.58, threshold 0.60)",
    ]);
    expect(img?.detections[3]?.reviewNotes).toEqual(["engine flagged for review"]);

    // Verify image notes: kept-face note MUST come first
    expect(img?.reviewNotes).toEqual([
      "kept face near allow list threshold (similarity 0.62, threshold 0.60)",
      "low confidence 0.41",
      "redacted face near allow list threshold (similarity 0.58, threshold 0.60)",
      "engine flagged for review",
    ]);

    // Existing reviewReasons should remain unchanged
    expect(img?.reviewReasons).toEqual([
      "Low confidence",
      "Similarity near allow list threshold",
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
      "d-g5-failed.jpg", // FAILED
      "m-g2-kept.jpg", // Similarity near whitelist threshold first
      "a-g1-conf35.jpg", // Group 1 (conf 0.35)
      "z-g1-conf50.jpg", // Group 1 (conf 0.50)
      "b-g3-highconf.jpg", // Group 3 (no review, conf 0.95)
      "c-g4-nodet.jpg", // Group 4 (no review, conf null)
    ]);

    // reviewImages follows the same image order
    expect(report.reviewImages.map((r) => r.originalFilename)).toEqual([
      "m-g2-kept.jpg",
      "a-g1-conf35.jpg",
      "z-g1-conf50.jpg",
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

describe("Face size filter and review candidate ordering (Step 2, 3, 5)", () => {
  it("does not flag image for a low confidence 15 px face, but does flag for a 16 px face", () => {
    // 15 px face (25 - 10 = 15 px)
    const job15px = reportInput(
      {
        detections: [
          {
            label: "face",
            confidence: 0.2,
            box: [10, 10, 25, 30],
            redacted: true,
            lowConfidence: true,
          },
        ],
      },
      "COMPLETED",
      { id: "j-15", inputKey: "k-15", originalFilename: "face-15px.jpg" },
    );

    // 16 px face (26 - 10 = 16 px)
    const job16px = reportInput(
      {
        detections: [
          {
            label: "face",
            confidence: 0.2,
            box: [10, 10, 26, 30],
            redacted: true,
            lowConfidence: true,
          },
        ],
      },
      "COMPLETED",
      { id: "j-16", inputKey: "k-16", originalFilename: "face-16px.jpg" },
    );

    const report = toReportResponse(batchInput() as never, [job15px as never, job16px as never]);

    const img15 = report.images.find((img) => img.originalFilename === "face-15px.jpg");
    expect(img15?.needsReview).toBe(false);
    expect(img15?.reviewReasons).toEqual([]);
    expect(img15?.reviewNotes).toEqual([]);
    expect(img15?.largestReviewFaceWidth).toBeNull();
    // Engine truth is still preserved on detection level
    expect(img15?.detections[0]?.lowConfidence).toBe(true);

    const img16 = report.images.find((img) => img.originalFilename === "face-16px.jpg");
    expect(img16?.needsReview).toBe(true);
    expect(img16?.reviewReasons).toEqual(["Low confidence"]);
    expect(img16?.reviewNotes).toEqual(["low confidence 0.20"]);
    expect(img16?.largestReviewFaceWidth).toBe(16);
    expect(img16?.detections[0]?.lowConfidence).toBe(true);
  });

  it("flags an image for a low confidence plate even when under 16 px", () => {
    // 12 px plate (22 - 10 = 12 px)
    const jobPlate = reportInput(
      {
        detections: [
          {
            label: "plate",
            confidence: 0.09,
            box: [10, 10, 22, 20],
            redacted: true,
            lowConfidence: true,
          },
        ],
      },
      "COMPLETED",
      { id: "j-plate", inputKey: "k-plate", originalFilename: "plate-12px.jpg" },
    );

    const report = toReportResponse(batchInput() as never, [jobPlate as never]);
    const imgPlate = report.images.find((img) => img.originalFilename === "plate-12px.jpg");
    expect(imgPlate?.needsReview).toBe(true);
    expect(imgPlate?.reviewReasons).toEqual(["Low confidence"]);
    expect(imgPlate?.reviewNotes).toEqual(["low confidence 0.09"]);
    // Since it's a plate and not a face, largestReviewFaceWidth is null
    expect(imgPlate?.largestReviewFaceWidth).toBeNull();
  });

  it("flags an image for a small kept face near the similarity threshold", () => {
    // 10 px kept face near similarity threshold 0.60 (similarity 0.58, diff 0.02 <= 0.05)
    const jobKeptFace = reportInput(
      {
        detections: [
          {
            label: "face",
            box: [0, 0, 10, 10],
            whitelisted: true,
            similarity: 0.58,
          },
        ],
      },
      "COMPLETED",
      { id: "j-kept", inputKey: "k-kept", originalFilename: "kept-10px.jpg" },
    );

    const report = toReportResponse(batchInput({ config: { similarityThreshold: 0.6 } }) as never, [
      jobKeptFace as never,
    ]);
    const imgKept = report.images.find((img) => img.originalFilename === "kept-10px.jpg");
    expect(imgKept?.needsReview).toBe(true);
    expect(imgKept?.reviewReasons).toEqual(["Similarity near allow list threshold"]);
    expect(imgKept?.largestReviewFaceWidth).toBe(10);
  });

  it("preserves lowConfidence totals unchanged by the face size filter", () => {
    // Both 15 px face and 16 px face have lowConfidence: true
    const job15px = reportInput(
      {
        detections: [{ label: "face", confidence: 0.2, box: [0, 0, 15, 20], redacted: true, lowConfidence: true }],
      },
      "COMPLETED",
      { id: "j-15", inputKey: "k-15", originalFilename: "f15.jpg" },
    );
    const job16px = reportInput(
      {
        detections: [{ label: "face", confidence: 0.2, box: [0, 0, 16, 20], redacted: true, lowConfidence: true }],
      },
      "COMPLETED",
      { id: "j-16", inputKey: "k-16", originalFilename: "f16.jpg" },
    );

    const report = toReportResponse(batchInput() as never, [job15px as never, job16px as never]);
    // totals.lowConfidence reflects Engine truth (both detections)
    expect(report.totals.lowConfidence).toBe(2);
    expect(report.lowConfidenceDetections).toHaveLength(2);
    // Only f16 is in reviewImages
    expect(report.reviewImages.map((img) => img.originalFilename)).toEqual(["f16.jpg"]);
  });

  it("sorts review images by similarity first, then larger face before smaller even when smaller has lower confidence", () => {
    // Image 1: Similarity near threshold (small face: 15 px, confidence 0.50)
    const jobSim = reportInput(
      {
        detections: [{ label: "face", box: [0, 0, 15, 15], whitelisted: true, similarity: 0.59 }],
      },
      "COMPLETED",
      { id: "j-sim", inputKey: "k-sim", originalFilename: "1-similarity.jpg" },
    );

    // Image 2: Large face (80 px width), higher confidence (0.24)
    const jobLarge = reportInput(
      {
        detections: [{ label: "face", box: [0, 0, 80, 80], confidence: 0.24, redacted: true, lowConfidence: true }],
      },
      "COMPLETED",
      { id: "j-large", inputKey: "k-large", originalFilename: "2-large-face.jpg" },
    );

    // Image 3: Smaller face (30 px width), lower confidence (0.18)
    const jobSmall = reportInput(
      {
        detections: [{ label: "face", box: [0, 0, 30, 30], confidence: 0.18, redacted: true, lowConfidence: true }],
      },
      "COMPLETED",
      { id: "j-small", inputKey: "k-small", originalFilename: "3-small-face.jpg" },
    );

    // Shuffled input
    const report = toReportResponse(batchInput({ config: { similarityThreshold: 0.6 } }) as never, [
      jobSmall as never,
      jobLarge as never,
      jobSim as never,
    ]);

    expect(report.images.map((img) => img.originalFilename)).toEqual([
      "1-similarity.jpg",
      "2-large-face.jpg",
      "3-small-face.jpg",
    ]);
  });
});
