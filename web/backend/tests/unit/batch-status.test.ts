import { describe, expect, it } from "vitest";
import { deriveBatchStatus } from "../../src/domain";

describe("Batch Status Derivation", () => {
  it("derives PROCESSING while any job is non-terminal", () => {
    expect(deriveBatchStatus(["QUEUED"])).toBe("PROCESSING");
    expect(deriveBatchStatus(["PENDING", "PROCESSING"])).toBe("PROCESSING");
    expect(deriveBatchStatus(["PROCESSING", "COMPLETED"])).toBe("PROCESSING");
    expect(deriveBatchStatus(["FAILED", "QUEUED"])).toBe("PROCESSING");
  });

  it("derives COMPLETED when all jobs are completed", () => {
    expect(deriveBatchStatus(["COMPLETED"])).toBe("COMPLETED");
    expect(deriveBatchStatus(["COMPLETED", "COMPLETED", "COMPLETED"])).toBe("COMPLETED");
  });

  it("derives PARTIAL when all jobs are terminal with at least 1 failed", () => {
    expect(deriveBatchStatus(["FAILED"])).toBe("PARTIAL");
    expect(deriveBatchStatus(["COMPLETED", "FAILED"])).toBe("PARTIAL");
    expect(deriveBatchStatus(["FAILED", "FAILED"])).toBe("PARTIAL");
    expect(deriveBatchStatus(["COMPLETED", "COMPLETED", "FAILED"])).toBe("PARTIAL");
  });

  it("derives DRAFT when startedAt is null", () => {
    expect(deriveBatchStatus([], null)).toBe("DRAFT");
    expect(deriveBatchStatus(["PENDING"], null)).toBe("DRAFT");
    expect(deriveBatchStatus(["COMPLETED"], null)).toBe("DRAFT");
  });

  it("handles empty jobs array gracefully as PROCESSING", () => {
    expect(deriveBatchStatus([])).toBe("PROCESSING");
  });
});
