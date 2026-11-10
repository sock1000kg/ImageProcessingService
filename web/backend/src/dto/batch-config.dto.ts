/**
 * Zod validation schemas and parsers for batch processing and redaction configurations.
 */
import { z } from "zod";
import { badRequest } from "../errors";

export const redactionTargetSchema = z.enum(["face", "plate"]);
export type RedactionTarget = z.infer<typeof redactionTargetSchema>;

export const redactionStyleSchema = z.enum(["blur", "pixelate", "blackout"]);
export type RedactionStyle = z.infer<typeof redactionStyleSchema>;

export const outputQualitySchema = z.enum(["standard", "high", "max"]);
export type OutputQuality = z.infer<typeof outputQualitySchema>;

export const outputFormatSchema = z.enum(["original", "jpg", "jpeg", "png", "webp"]);
export type OutputFormat = z.infer<typeof outputFormatSchema>;

export const detectionModeSchema = z.enum(["fast", "accurate", "max_privacy"]);
export type DetectionMode = z.infer<typeof detectionModeSchema>;

export const rawBatchConfigSchema = z.object({
  targets: z.array(redactionTargetSchema).min(1).default(["face", "plate"]),
  style: redactionStyleSchema.default("blur"),
  strength: z.number().int().positive().optional(),
  padding: z.number().min(0).max(0.5).default(0.1),
  quality: outputQualitySchema.default("high"),
  format: outputFormatSchema.default("original"),
  faceConfidenceThreshold: z.number().min(0).max(1).default(0.17),
  plateConfidenceThreshold: z.number().min(0).max(1).default(0.11),
  reviewThreshold: z.number().min(0).max(1).default(0.25),
  similarityThreshold: z.number().min(0).max(1).default(0.45),
  detectionMode: detectionModeSchema.default("fast"),
  whitelistPlates: z
    .array(
      z
        .string()
        .trim()
        .toUpperCase()
        .transform((value) => value.replace(/[\s.-]/g, "")),
    )
    .max(20)
    .default([]),
});

export const batchConfigSchema = z.object({
  targets: z.array(redactionTargetSchema),
  style: redactionStyleSchema,
  strength: z.number().int().positive().optional(),
  padding: z.number().min(0).max(0.5),
  quality: outputQualitySchema,
  format: outputFormatSchema,
  faceConfidenceThreshold: z.number().min(0).max(1).default(0.17),
  plateConfidenceThreshold: z.number().min(0).max(1).default(0.11),
  reviewThreshold: z.number().min(0).max(1).default(0.25),
  similarityThreshold: z.number().min(0).max(1).default(0.45),
  detectionMode: detectionModeSchema.default("fast"),
  whitelistPlates: z
    .array(
      z
        .string()
        .trim()
        .toUpperCase()
        .transform((value) => value.replace(/[\s.-]/g, "")),
    )
    .max(20)
    .default([]),
});

export type BatchConfig = z.infer<typeof batchConfigSchema>;

/**
 * Default redaction strength parameters mirroring Engine Contract §2.
 * Blur is percentage of box width (1-50, default 15); pixelate is cells across box width (3-32, default 8).
 */
export const DEFAULT_REDACTION_STRENGTHS = {
  blur: 15,
  pixelate: 8,
} as const;

const DETECTION_MODE_THRESHOLDS: Record<DetectionMode, { face: number; plate: number }> = {
  fast: { face: 0.17, plate: 0.11 },
  accurate: { face: 0.13, plate: 0.09 },
  max_privacy: { face: 0.06, plate: 0.05 },
};

export function parseBatchConfig(raw: unknown): BatchConfig {
  const data = rawBatchConfigSchema.parse(raw ?? {});
  const rawObject = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const modeThresholds = DETECTION_MODE_THRESHOLDS[data.detectionMode];
  const faceConfidenceThreshold =
    "faceConfidenceThreshold" in rawObject ? data.faceConfidenceThreshold : modeThresholds.face;
  const plateConfidenceThreshold =
    "plateConfidenceThreshold" in rawObject ? data.plateConfidenceThreshold : modeThresholds.plate;
  let strength = data.strength;
  if (strength === undefined) {
    // Why: Contract §2 relative strength defaults (blur: 15% of box width, pixelate: 8 cells across).
    if (data.style === "blur") {
      strength = DEFAULT_REDACTION_STRENGTHS.blur;
    } else if (data.style === "pixelate") {
      strength = DEFAULT_REDACTION_STRENGTHS.pixelate;
    }
  }

  const cfg: BatchConfig = {
    targets: data.targets,
    style: data.style,
    padding: data.padding,
    quality: data.quality,
    format: data.format,
    faceConfidenceThreshold,
    plateConfidenceThreshold,
    reviewThreshold: data.reviewThreshold,
    similarityThreshold: data.similarityThreshold,
    detectionMode: data.detectionMode,
    whitelistPlates: data.whitelistPlates.filter(Boolean),
  };
  if (strength !== undefined) {
    cfg.strength = strength;
  }
  return cfg;
}

export function parseBatchConfigJson(input: unknown): BatchConfig {
  if (input === undefined || input === null || input === "") {
    return parseBatchConfig({});
  }
  if (typeof input === "object") {
    return parseBatchConfig(input);
  }
  if (typeof input !== "string") {
    throw badRequest("Invalid batch config: must be a JSON object or string", "VALIDATION_ERROR");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw badRequest("Invalid batch config: must be valid JSON", "INVALID_JSON");
  }
  return parseBatchConfig(parsed);
}
