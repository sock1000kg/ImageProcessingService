import { describe, expect, it } from "vitest";
import { toReportResponse } from "../../src/dto/batch.dto";

function reportInput(summary: unknown, status = "COMPLETED") {
  return {
    id: "job-1",
    batchId: "batch-1",
    originalFilename: "photo.jpg",
    status,
    progress: status === "COMPLETED" ? 100 : 0,
    stage: null,
    resultUrl: null,
    resultSummary: summary,
    error: null,
    createdAt: new Date("2026-10-30T00:00:00Z"),
    updatedAt: new Date("2026-10-30T00:00:00Z"),
  };
}

function batchInput() {
  return {
    id: "batch-1",
    config: { similarityThreshold: 0.6 },
    whitelistKeys: [],
    whitelistDeletedAt: null,
    createdAt: new Date("2026-10-30T00:00:00Z"),
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
    const report = toReportResponse(batchInput() as never, [
      reportInput({ detections: [] }) as never,
    ]);

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
