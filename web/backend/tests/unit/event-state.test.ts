import { describe, expect, it } from "vitest";
import { calculateNextJobState, JobState } from "../../src/batch-logic";
import { jobEventSchema, ValidatedJobEvent } from "../../src/schemas/job-event.schema";

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

  it("handles duplicate COMPLETED events harmlessly", () => {
    const completedEvent: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "COMPLETED",
      progress: 100,
      stage: "DONE",
      result: { bucket: "results", key: "batch-1/job-1/result.jpg" },
      resultSummary: { counts: { face: 2, redacted: 2 } },
    };

    // First COMPLETED event transitions to COMPLETED
    const firstState = calculateNextJobState(initialQueuedState, completedEvent);
    expect(firstState.status).toBe("COMPLETED");
    expect(firstState.progress).toBe(100);
    expect(firstState.resultUrl).toBe("/results/batch-1/job-1/result.jpg");
    expect(firstState.resultSummary).toEqual({ counts: { face: 2, redacted: 2 } });

    // Second duplicate COMPLETED event is harmless and does not alter state
    const duplicateState = calculateNextJobState(firstState, completedEvent);
    expect(duplicateState).toEqual(firstState);
  });

  it("ignores PROCESSING events arriving after COMPLETED (terminal-state protection)", () => {
    const completedState: JobState = {
      status: "COMPLETED",
      progress: 100,
      stage: "DONE",
      resultUrl: "/results/batch-1/job-1/result.jpg",
      resultSummary: { counts: { face: 1 } },
      error: null,
    };

    const staleProcessingEvent: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "PROCESSING",
      progress: 90,
      stage: "ENCODING",
    };

    const next = calculateNextJobState(completedState, staleProcessingEvent);
    expect(next.status).toBe("COMPLETED");
    expect(next.progress).toBe(100);
    expect(next.stage).toBe("DONE");
    expect(next.resultUrl).toBe("/results/batch-1/job-1/result.jpg");
  });

  it("first terminal event wins: FAILED then COMPLETED remains FAILED", () => {
    const failedEvent: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "FAILED",
      progress: 50,
      stage: "DETECTING",
      error: { code: "INVALID_INPUT_FILE", message: "Corrupt image" },
    };

    const failedState = calculateNextJobState(initialQueuedState, failedEvent);
    expect(failedState.status).toBe("FAILED");
    expect(failedState.error?.code).toBe("INVALID_INPUT_FILE");

    const subsequentCompletedEvent: ValidatedJobEvent = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "COMPLETED",
      progress: 100,
      result: { bucket: "results", key: "batch-1/job-1/result.jpg" },
    };

    const stateAfterCompleted = calculateNextJobState(failedState, subsequentCompletedEvent);
    expect(stateAfterCompleted.status).toBe("FAILED");
    expect(stateAfterCompleted.error?.code).toBe("INVALID_INPUT_FILE");
    expect(stateAfterCompleted.resultUrl).toBeNull();
  });

  it("accepts FAILED event with empty message and non-contract error code", () => {
    const rawPayload = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "FAILED",
      error: {
        code: "INTERNAL_WORKER_ERROR",
        message: "",
      },
    };

    const parseResult = jobEventSchema.safeParse(rawPayload);
    expect(parseResult.success).toBe(true);

    if (parseResult.success) {
      const failedState = calculateNextJobState(initialQueuedState, parseResult.data);
      expect(failedState.status).toBe("FAILED");
      expect(failedState.error).toEqual({
        code: "INTERNAL_WORKER_ERROR",
        message: "",
      });
    }
  });

  it("accepts non-integer floating progress 42.7 and stores as 43", () => {
    const rawPayload = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "PROCESSING",
      progress: 42.7,
      stage: "REDACTING",
    };

    const parseResult = jobEventSchema.safeParse(rawPayload);
    expect(parseResult.success).toBe(true);

    if (parseResult.success) {
      const next = calculateNextJobState(initialQueuedState, parseResult.data);
      expect(next.progress).toBe(43);
    }
  });

  it("accepts progress 150 and clamps/stores as 100", () => {
    const rawPayload = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "PROCESSING",
      progress: 150,
      stage: "REDACTING",
    };

    const parseResult = jobEventSchema.safeParse(rawPayload);
    expect(parseResult.success).toBe(true);

    if (parseResult.success) {
      const next = calculateNextJobState(initialQueuedState, parseResult.data);
      expect(next.progress).toBe(100);
    }
  });

  it("malformed optional fields do not invalidate COMPLETED or FAILED events", () => {
    const payloadWithBadFields = {
      jobId: "a1b2c3d4-5678-40ab-8def-112233445566",
      status: "COMPLETED",
      batchId: "not-a-valid-uuid",
      progress: "not-a-number",
      timestamp: 12345,
      result: { bucket: "results", key: "batch-1/job-1/result.jpg" },
    };

    const parseResult = jobEventSchema.safeParse(payloadWithBadFields);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.status).toBe("COMPLETED");
      expect(parseResult.data.batchId).toBeUndefined();
      expect(parseResult.data.result?.key).toBe("batch-1/job-1/result.jpg");
    }
  });
});
