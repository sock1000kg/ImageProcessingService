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

export const rawBatchConfigSchema = z.object({
  targets: z.array(redactionTargetSchema).min(1).default(["face", "plate"]),
  style: redactionStyleSchema.default("blur"),
  strength: z.number().int().positive().optional(),
  padding: z.number().min(0).max(0.5).default(0.1),
  quality: outputQualitySchema.default("high"),
  format: outputFormatSchema.default("original"),
  confidenceThreshold: z.number().min(0).max(1).default(0.35),
  reviewThreshold: z.number().min(0).max(1).default(0.5),
  similarityThreshold: z.number().min(0).max(1).default(0.6),
});

export const batchConfigSchema = z.object({
  targets: z.array(redactionTargetSchema),
  style: redactionStyleSchema,
  strength: z.number().int().positive().optional(),
  padding: z.number().min(0).max(0.5),
  quality: outputQualitySchema,
  format: outputFormatSchema,
  confidenceThreshold: z.number().min(0).max(1),
  reviewThreshold: z.number().min(0).max(1),
  similarityThreshold: z.number().min(0).max(1),
});

export type BatchConfig = z.infer<typeof batchConfigSchema>;

export function parseBatchConfig(raw: unknown): BatchConfig {
  const data = rawBatchConfigSchema.parse(raw ?? {});
  let strength = data.strength;
  if (strength === undefined) {
    if (data.style === "blur") {
      strength = 25;
    } else if (data.style === "pixelate") {
      strength = 12;
    }
  }

  const cfg: BatchConfig = {
    targets: data.targets,
    style: data.style,
    padding: data.padding,
    quality: data.quality,
    format: data.format,
    confidenceThreshold: data.confidenceThreshold,
    reviewThreshold: data.reviewThreshold,
    similarityThreshold: data.similarityThreshold,
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
