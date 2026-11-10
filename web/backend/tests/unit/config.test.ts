import { describe, expect, it } from "vitest";
import { configSchema } from "../../src/config";
import { parseBatchConfig, parseBatchConfigJson } from "../../src/dto";

describe("Batch Config Schema and Defaults", () => {
  it("applies contract defaults when empty object provided", () => {
    const config = parseBatchConfig({});
    expect(config.targets).toEqual(["face", "plate"]);
    expect(config.style).toBe("blur");
    expect(config.strength).toBe(15);
    expect(config.padding).toBe(0.1);
    expect(config.quality).toBe("high");
    expect(config.format).toBe("original");
    expect(config.faceConfidenceThreshold).toBe(0.17);
    expect(config.plateConfidenceThreshold).toBe(0.11);
    expect(config.reviewThreshold).toBe(0.25);
    expect(config.similarityThreshold).toBe(0.45);
  });

  it("parses stored config containing only legacy confidenceThreshold without error and gets new defaults", () => {
    const config = parseBatchConfig({ confidenceThreshold: 0.25 });
    expect(config.faceConfidenceThreshold).toBe(0.17);
    expect(config.plateConfidenceThreshold).toBe(0.11);
  });

  it("allows overriding specific thresholds while leaving others at default", () => {
    const config = parseBatchConfig({ faceConfidenceThreshold: 0.2 });
    expect(config.faceConfidenceThreshold).toBe(0.2);
    expect(config.plateConfidenceThreshold).toBe(0.11);
  });

  it("applies pixelate default strength of 8 when style is pixelate", () => {
    const config = parseBatchConfig({ style: "pixelate" });
    expect(config.style).toBe("pixelate");
    expect(config.strength).toBe(8);
  });

  it("defaults strength to 15 for blur and 8 for pixelate when strength is omitted", () => {
    expect(parseBatchConfig({ style: "blur" }).strength).toBe(15);
    expect(parseBatchConfig({ style: "pixelate" }).strength).toBe(8);
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
    expect(config.strength).toBe(8);
    expect(config.quality).toBe("max");
    expect(config.format).toBe("png");
  });

  it("handles null/undefined/empty input in parseBatchConfigJson with defaults", () => {
    expect(parseBatchConfigJson(undefined).style).toBe("blur");
    expect(parseBatchConfigJson(null).style).toBe("blur");
    expect(parseBatchConfigJson("").style).toBe("blur");
  });

  it("uses detection mode defaults unless thresholds are explicitly supplied", () => {
    expect(parseBatchConfig({ detectionMode: "accurate" })).toMatchObject({
      detectionMode: "accurate",
      faceConfidenceThreshold: 0.13,
      plateConfidenceThreshold: 0.09,
    });
    expect(parseBatchConfig({ detectionMode: "max_privacy", faceConfidenceThreshold: 0.2 })).toMatchObject({
      detectionMode: "max_privacy",
      faceConfidenceThreshold: 0.2,
      plateConfidenceThreshold: 0.05,
    });
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

  it("throws validation error for faceConfidenceThreshold > 1", () => {
    expect(() => parseBatchConfig({ faceConfidenceThreshold: 1.5 })).toThrow(/faceConfidenceThreshold/);
  });

  it("throws validation error for faceConfidenceThreshold < 0", () => {
    expect(() => parseBatchConfig({ faceConfidenceThreshold: -0.1 })).toThrow(/faceConfidenceThreshold/);
  });

  it("throws validation error for plateConfidenceThreshold > 1", () => {
    expect(() => parseBatchConfig({ plateConfidenceThreshold: 1.5 })).toThrow(/plateConfidenceThreshold/);
  });

  it("throws validation error for plateConfidenceThreshold < 0", () => {
    expect(() => parseBatchConfig({ plateConfidenceThreshold: -0.1 })).toThrow(/plateConfidenceThreshold/);
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

describe("S3_PUBLIC_ENDPOINT config schema validation", () => {
  it("defaults to http://localhost:9000 when undefined", () => {
    expect(configSchema.shape.S3_PUBLIC_ENDPOINT.parse(undefined)).toBe("http://localhost:9000");
  });

  it("accepts custom valid URL strings", () => {
    expect(configSchema.shape.S3_PUBLIC_ENDPOINT.parse("https://blob-imgproc.sock1000kg.io.vn")).toBe(
      "https://blob-imgproc.sock1000kg.io.vn",
    );
  });

  it("rejects empty string", () => {
    expect(() => configSchema.shape.S3_PUBLIC_ENDPOINT.parse("")).toThrow();
  });
});

describe("PRESIGN_RESULT_TTL_SECONDS config schema validation", () => {
  it("defaults to 3600 when undefined", () => {
    expect(configSchema.shape.PRESIGN_RESULT_TTL_SECONDS.parse(undefined)).toBe(3600);
  });

  it("accepts positive integers and numeric strings", () => {
    expect(configSchema.shape.PRESIGN_RESULT_TTL_SECONDS.parse(1800)).toBe(1800);
    expect(configSchema.shape.PRESIGN_RESULT_TTL_SECONDS.parse("7200")).toBe(7200);
  });

  it("rejects non-positive numbers", () => {
    expect(() => configSchema.shape.PRESIGN_RESULT_TTL_SECONDS.parse(0)).toThrow();
    expect(() => configSchema.shape.PRESIGN_RESULT_TTL_SECONDS.parse(-10)).toThrow();
  });
});

describe("PRESIGN_PRIVATE_TTL_SECONDS config schema validation", () => {
  it("defaults to 300 when undefined", () => {
    expect(configSchema.shape.PRESIGN_PRIVATE_TTL_SECONDS.parse(undefined)).toBe(300);
  });

  it("accepts positive integers and numeric strings", () => {
    expect(configSchema.shape.PRESIGN_PRIVATE_TTL_SECONDS.parse(600)).toBe(600);
    expect(configSchema.shape.PRESIGN_PRIVATE_TTL_SECONDS.parse("120")).toBe(120);
  });

  it("rejects non-positive numbers", () => {
    expect(() => configSchema.shape.PRESIGN_PRIVATE_TTL_SECONDS.parse(0)).toThrow();
    expect(() => configSchema.shape.PRESIGN_PRIVATE_TTL_SECONDS.parse(-5)).toThrow();
  });
});
