import { describe, expect, it } from "vitest";
import { buildImageRedactCommand, resolveOutputExtension } from "../../src/domain";
import { parseBatchConfig } from "../../src/dto";

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
          strength: 8,
          padding: 0.1,
        },
        output: { quality: "high" },
        confidenceThresholds: { face: 0.17, plate: 0.11 },
        detection: { mode: "fast" },
        reviewThreshold: 0.25,
      },
    });
  });

  it("builds exact §2A command with whitelist reference faces", () => {
    const config = parseBatchConfig({
      targets: ["face"],
      style: "blur",
      strength: 30,
      padding: 0.2,
      quality: "max",
      similarityThreshold: 0.75,
    });

    const command = buildImageRedactCommand({
      jobId: "job-789",
      batchId: "batch-456",
      inputKey: "batch-456/job-789/input.png",
      outputKey: "batch-456/job-789/result.png",
      config,
      whitelistKeys: ["batch-456/whitelist/face-1.jpg", "batch-456/whitelist/face-2.png"],
    });

    expect(command).toEqual({
      jobId: "job-789",
      batchId: "batch-456",
      type: "image-redact",
      input: { bucket: "uploads", key: "batch-456/job-789/input.png" },
      output: { bucket: "results", key: "batch-456/job-789/result.png" },
      params: {
        redaction: {
          targets: ["face"],
          style: "blur",
          strength: 30,
          padding: 0.2,
        },
        output: { quality: "max" },
        confidenceThresholds: { face: 0.17, plate: 0.11 },
        detection: { mode: "fast" },
        reviewThreshold: 0.25,
        whitelist: {
          faces: [
            { bucket: "uploads", key: "batch-456/whitelist/face-1.jpg" },
            { bucket: "uploads", key: "batch-456/whitelist/face-2.png" },
          ],
          similarityThreshold: 0.75,
        },
      },
    });
  });

  it("supports blackout style without strength parameter", () => {
    const config = parseBatchConfig({ style: "blackout" });
    const command = buildImageRedactCommand({
      jobId: "job-001",
      batchId: "batch-001",
      inputKey: "input.jpg",
      outputKey: "result.jpg",
      config,
    });

    expect(command.params.redaction.style).toBe("blackout");
    expect(command.params.redaction.strength).toBeUndefined();
  });

  it("builds command with custom per-class confidence thresholds", () => {
    const config = parseBatchConfig({
      faceConfidenceThreshold: 0.25,
      plateConfidenceThreshold: 0.15,
      reviewThreshold: 0.4,
    });
    const command = buildImageRedactCommand({
      jobId: "job-custom",
      batchId: "batch-custom",
      inputKey: "input.jpg",
      outputKey: "result.jpg",
      config,
    });
    expect(command.params.confidenceThresholds).toEqual({ face: 0.25, plate: 0.15 });
    expect(command.params.reviewThreshold).toBe(0.4);
  });

  it("serializes detection mode and applies its default thresholds", () => {
    const config = parseBatchConfig({ detectionMode: "max_privacy" });
    const command = buildImageRedactCommand({
      jobId: "job-mode",
      batchId: "batch-mode",
      inputKey: "input.jpg",
      outputKey: "result.jpg",
      config,
    });

    expect(command.params.detection).toEqual({ mode: "max_privacy" });
    expect(command.params.confidenceThresholds).toEqual({ face: 0.06, plate: 0.05 });
  });
});
