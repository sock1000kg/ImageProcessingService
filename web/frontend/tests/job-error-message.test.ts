import { describe, expect, it } from "vitest";
import { formatJobErrorMessage } from "../src/utils/format";

describe("formatJobErrorMessage", () => {
  it("a timed-out job says what to change, not only that it was too slow", () => {
    const text = formatJobErrorMessage({
      code: "JOB_TIMEOUT",
      message: "Processing did not finish within the 180-minute limit",
    });
    expect(text).toMatch(/180-minute/);
    expect(text).toMatch(/fast mode/i);
  });

  it("a crashed job gets a readable explanation", () => {
    expect(
      formatJobErrorMessage({ code: "WORKER_CRASHED", message: "Job crashed or timed out after 3 attempts" }),
    ).toMatch(/retry/i);
  });

  it("other errors keep the Engine's message", () => {
    expect(formatJobErrorMessage({ code: "INVALID_INPUT_FILE", message: "Cannot identify or decode image file" })).toBe(
      "Cannot identify or decode image file",
    );
  });
});
