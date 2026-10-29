import { describe, expect, it } from "vitest";
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
    expect(config.similarityThreshold).toBe(0.6);
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
