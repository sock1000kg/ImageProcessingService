import { describe, expect, it } from "vitest";
import { calculateNextJobState, JobState } from "../../src/domain";
import { jobEventSchema, ValidatedJobEvent } from "../../src/dto";

describe("Event Sequences and State Transitions (§8)", () => {
  const initialQueuedState: JobState = {
    status: "QUEUED",
    progress: 0,
    stage: null,
    resultUrl: null,
    resultSummary: null,
    error: null,
  };

  it("updates job from QUEUED to PROCESSING with progress and stage", () => {
    const event: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "PROCESSING",
      progress: 30,
      stage: "DETECTING",
    };

    const next = calculateNextJobState(initialQueuedState, event);
    expect(next.status).toBe("PROCESSING");
    expect(next.progress).toBe(30);
    expect(next.stage).toBe("DETECTING");
  });

  it("ensures progress never decreases when an out-of-order lower progress event arrives", () => {
    const current: JobState = {
      status: "PROCESSING",
      progress: 60,
      stage: "REDACTING",
      resultUrl: null,
      resultSummary: null,
      error: null,
    };

    const event: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "PROCESSING",
      progress: 40,
      stage: "DETECTING",
    };

    const next = calculateNextJobState(current, event);
    expect(next.status).toBe("PROCESSING");
    expect(next.progress).toBe(60);
  });

  it("updates job to COMPLETED with 100% progress and resultUrl", () => {
    const current: JobState = {
      status: "PROCESSING",
      progress: 80,
      stage: "SAVING",
      resultUrl: null,
      resultSummary: null,
      error: null,
    };

    const event: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "COMPLETED",
      stage: "DONE",
      result: { bucket: "results", key: "batch-1/job-1/result.jpg" },
      resultSummary: { counts: { face: 1, plate: 2, redacted: 3 } },
    };

    const next = calculateNextJobState(current, event, "/results");
    expect(next.status).toBe("COMPLETED");
    expect(next.progress).toBe(100);
    expect(next.stage).toBe("DONE");
    expect(next.resultUrl).toBe("/results/batch-1/job-1/result.jpg");
    expect(next.resultSummary).toEqual({ counts: { face: 1, plate: 2, redacted: 3 } });
  });

  it("updates job to FAILED with error payload", () => {
    const current: JobState = {
      status: "PROCESSING",
      progress: 45,
      stage: "REDACTING",
      resultUrl: null,
      resultSummary: null,
      error: null,
    };

    const event: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "FAILED",
      error: { code: "CORRUPT_IMAGE", message: "Image cannot be decoded" },
    };

    const next = calculateNextJobState(current, event);
    expect(next.status).toBe("FAILED");
    expect(next.progress).toBe(45);
    expect(next.error).toEqual({ code: "CORRUPT_IMAGE", message: "Image cannot be decoded" });
  });

  it("applies terminal state protection: ignores event arriving after COMPLETED", () => {
    const completedState: JobState = {
      status: "COMPLETED",
      progress: 100,
      stage: "DONE",
      resultUrl: "/results/result.jpg",
      resultSummary: { counts: { face: 1 } },
      error: null,
    };

    const lateEvent: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "FAILED",
      error: { code: "LATE_FAILURE", message: "Late failure event" },
    };

    const next = calculateNextJobState(completedState, lateEvent);
    expect(next.status).toBe("COMPLETED");
    expect(next.error).toBeNull();
  });

  it("applies terminal state protection: ignores event arriving after FAILED", () => {
    const failedState: JobState = {
      status: "FAILED",
      progress: 20,
      stage: "DETECTING",
      resultUrl: null,
      resultSummary: null,
      error: { code: "EARLY_FAILURE", message: "Early failure" },
    };

    const lateEvent: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "COMPLETED",
      result: { bucket: "results", key: "too-late.jpg" },
    };

    const next = calculateNextJobState(failedState, lateEvent);
    expect(next.status).toBe("FAILED");
    expect(next.resultUrl).toBeNull();
  });

  it("validates event with jobEventSchema", () => {
    const raw = {
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      status: "PROCESSING",
      progress: 75,
      stage: "SAVING",
    };

    const parsed = jobEventSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.jobId).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(parsed.data.status).toBe("PROCESSING");
      expect(parsed.data.progress).toBe(75);
    }
  });

  it("rejects invalid status in jobEventSchema", () => {
    const raw = {
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      status: "UNKNOWN_STATUS",
    };

    const parsed = jobEventSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
  });

  it("tolerates missing optional fields or catches schema variations", () => {
    const raw = {
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      status: "PROCESSING",
      progress: "invalid_progress_type",
    };

    const parsed = jobEventSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.progress).toBeUndefined();
    }
  });
});
