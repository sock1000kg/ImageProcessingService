import { describe, expect, it } from "vitest";
import { configSchema } from "../../src/config";
import { parseBatchConfig, parseBatchConfigJson } from "../../src/dto";

describe("Batch Config Schema and Defaults", () => {
  it("applies contract defaults when empty object provided", () => {
    const config = parseBatchConfig({});
    expect(config.targets).toEqual(["face", "plate"]);
    expect(config.style).toBe("blur");
    expect(config.strength).toBe(25);
    expect(config.padding).toBe(0.1);
    expect(config.quality).toBe("high");
    expect(config.format).toBe("original");
    expect(config.confidenceThreshold).toBe(0.35);
    expect(config.reviewThreshold).toBe(0.5);
    expect(config.similarityThreshold).toBe(0.45);
  });

  it("applies pixelate default strength of 12 when style is pixelate", () => {
    const config = parseBatchConfig({ style: "pixelate" });
    expect(config.style).toBe("pixelate");
    expect(config.strength).toBe(12);
  });

  it("omits strength by default when style is blackout", () => {
    const config = parseBatchConfig({ style: "blackout" });
    expect(config.style).toBe("blackout");
    expect(config.strength).toBeUndefined();
  });

  it("preserves explicit custom strength", () => {
    const config = parseBatchConfig({ style: "blur", strength: 40 });
    expect(config.strength).toBe(40);
  });

  it("parses valid JSON string with parseBatchConfigJson", () => {
    const jsonStr = JSON.stringify({
      targets: ["face"],
      style: "pixelate",
      quality: "max",
      format: "png",
    });
    const config = parseBatchConfigJson(jsonStr);
    expect(config.targets).toEqual(["face"]);
    expect(config.style).toBe("pixelate");
    expect(config.strength).toBe(12);
    expect(config.quality).toBe("max");
    expect(config.format).toBe("png");
  });

  it("handles null/undefined/empty input in parseBatchConfigJson with defaults", () => {
    expect(parseBatchConfigJson(undefined).style).toBe("blur");
    expect(parseBatchConfigJson(null).style).toBe("blur");
    expect(parseBatchConfigJson("").style).toBe("blur");
  });

  it("throws validation error for invalid JSON string", () => {
    expect(() => parseBatchConfigJson("{invalid-json")).toThrow("must be valid JSON");
  });

  it("throws validation error for empty targets array", () => {
    expect(() => parseBatchConfig({ targets: [] })).toThrow(/targets/);
  });

  it("throws validation error for invalid style", () => {
    expect(() => parseBatchConfig({ style: "unknown" })).toThrow(/style/);
  });

  it("throws validation error for padding exceeding 0.5", () => {
    expect(() => parseBatchConfig({ padding: 0.6 })).toThrow(/padding/);
  });

  it("throws validation error for negative padding", () => {
    expect(() => parseBatchConfig({ padding: -0.1 })).toThrow(/padding/);
  });

  it("throws validation error for confidenceThreshold > 1", () => {
    expect(() => parseBatchConfig({ confidenceThreshold: 1.5 })).toThrow(/confidenceThreshold/);
  });

  it("throws validation error for invalid quality", () => {
    expect(() => parseBatchConfig({ quality: "ultra" })).toThrow(/quality/);
  });

  it("throws validation error for invalid format", () => {
    expect(() => parseBatchConfig({ format: "gif" })).toThrow(/format/);
  });
});

describe("RATE_LIMIT_MULTIPLIER config schema validation", () => {
  it("defaults to 1 when undefined", () => {
    expect(configSchema.shape.RATE_LIMIT_MULTIPLIER.parse(undefined)).toBe(1);
  });

  it("accepts valid positive numbers and numeric strings", () => {
    expect(configSchema.shape.RATE_LIMIT_MULTIPLIER.parse(1)).toBe(1);
    expect(configSchema.shape.RATE_LIMIT_MULTIPLIER.parse("2")).toBe(2);
    expect(configSchema.shape.RATE_LIMIT_MULTIPLIER.parse(0.5)).toBe(0.5);
    expect(configSchema.shape.RATE_LIMIT_MULTIPLIER.parse("0.5")).toBe(0.5);
    expect(configSchema.shape.RATE_LIMIT_MULTIPLIER.parse(100)).toBe(100);
  });

  it("rejects 0", () => {
    expect(() => configSchema.shape.RATE_LIMIT_MULTIPLIER.parse(0)).toThrow();
    expect(() => configSchema.shape.RATE_LIMIT_MULTIPLIER.parse("0")).toThrow();
  });

  it("rejects negative values", () => {
    expect(() => configSchema.shape.RATE_LIMIT_MULTIPLIER.parse(-1)).toThrow();
    expect(() => configSchema.shape.RATE_LIMIT_MULTIPLIER.parse("-0.5")).toThrow();
  });

  it("rejects non-numeric values", () => {
    expect(() => configSchema.shape.RATE_LIMIT_MULTIPLIER.parse("abc")).toThrow();
    expect(() => configSchema.shape.RATE_LIMIT_MULTIPLIER.parse("not-a-number")).toThrow();
    expect(() => configSchema.shape.RATE_LIMIT_MULTIPLIER.parse({})).toThrow();
  });
});

describe("TRANSFER_RATE_LIMIT_MULTIPLIER config schema validation", () => {
  it("defaults to 1 when undefined", () => {
    expect(configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse(undefined)).toBe(1);
  });

  it("accepts valid positive numbers and numeric strings", () => {
    expect(configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse(1)).toBe(1);
    expect(configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse("2")).toBe(2);
    expect(configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse(0.5)).toBe(0.5);
    expect(configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse("0.5")).toBe(0.5);
    expect(configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse(100)).toBe(100);
  });

  it("rejects 0", () => {
    expect(() => configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse(0)).toThrow();
    expect(() => configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse("0")).toThrow();
  });

  it("rejects negative values", () => {
    expect(() => configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse(-1)).toThrow();
    expect(() => configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse("-0.5")).toThrow();
  });

  it("rejects non-numeric values", () => {
    expect(() => configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse("abc")).toThrow();
    expect(() => configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse("not-a-number")).toThrow();
    expect(() => configSchema.shape.TRANSFER_RATE_LIMIT_MULTIPLIER.parse({})).toThrow();
  });
});
