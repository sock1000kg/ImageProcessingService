import { describe, expect, it } from "vitest";
import {
  buildImageRedactCommand,
  parseBatchConfig,
  resolveOutputExtension,
} from "../../src/batch-logic";

describe("Command Builder and Extension Mapping (§2A & §5)", () => {
  it("resolves output extension from original input format", () => {
    expect(resolveOutputExtension("original", "photo.jpg")).toBe("jpg");
    expect(resolveOutputExtension("original", "photo.jpeg")).toBe("jpg");
    expect(resolveOutputExtension("original", "PHOTO.JPEG")).toBe("jpg");
    expect(resolveOutputExtension("original", "photo.png")).toBe("png");
    expect(resolveOutputExtension("original", "photo.webp")).toBe("webp");
    expect(resolveOutputExtension("original", "noext")).toBe("noext");
  });

  it("resolves output extension from explicit format setting", () => {
    expect(resolveOutputExtension("jpg", "photo.png")).toBe("jpg");
    expect(resolveOutputExtension("jpeg", "photo.png")).toBe("jpg");
    expect(resolveOutputExtension("png", "photo.jpg")).toBe("png");
    expect(resolveOutputExtension("webp", "photo.jpg")).toBe("webp");
  });

  it("builds exact §2A command without whitelist", () => {
    const config = parseBatchConfig({
      style: "pixelate",
      padding: 0.1,
      quality: "high",
    });

    const command = buildImageRedactCommand({
      jobId: "job-123",
      batchId: "batch-456",
      inputKey: "batch-456/job-123/input.jpg",
      outputKey: "batch-456/job-123/result.jpg",
      config,
    });

    expect(command).toEqual({
      jobId: "job-123",
      batchId: "batch-456",
      type: "image-redact",
      input: { bucket: "uploads", key: "batch-456/job-123/input.jpg" },
      output: { bucket: "results", key: "batch-456/job-123/result.jpg" },
      params: {
        redaction: {
          targets: ["face", "plate"],
          style: "pixelate",
          strength: 12,
          padding: 0.1,
        },
        output: {
          quality: "high",
        },
        confidenceThreshold: 0.35,
        reviewThreshold: 0.5,
      },
    });

    expect(command.params.whitelist).toBeUndefined();
  });

  it("builds exact §2A command with whitelist when reference keys are present", () => {
    const config = parseBatchConfig({
      targets: ["face", "plate"],
      style: "blur",
      similarityThreshold: 0.65,
    });

    const command = buildImageRedactCommand({
      jobId: "job-123",
      batchId: "batch-456",
      inputKey: "batch-456/job-123/input.png",
      outputKey: "batch-456/job-123/result.png",
      config,
      whitelistKeys: [
        "batch-456/whitelist/face-1.jpg",
        "batch-456/whitelist/face-2.png",
      ],
    });

    expect(command.params.whitelist).toBeDefined();
    expect(command.params.whitelist).toEqual({
      faces: [
        { bucket: "uploads", key: "batch-456/whitelist/face-1.jpg" },
        { bucket: "uploads", key: "batch-456/whitelist/face-2.png" },
      ],
      similarityThreshold: 0.65,
    });
  });

  it("omits whitelist property if whitelistKeys is empty array", () => {
    const config = parseBatchConfig({});
    const command = buildImageRedactCommand({
      jobId: "job-123",
      batchId: "batch-456",
      inputKey: "batch-456/job-123/input.jpg",
      outputKey: "batch-456/job-123/result.jpg",
      config,
      whitelistKeys: [],
    });
    expect(command.params.whitelist).toBeUndefined();
  });
});
