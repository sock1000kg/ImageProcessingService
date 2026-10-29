import { z } from "zod";
import {
  BatchConfig,
  BatchStatus,
  JobStatus,
  OutputFormat,
  OutputQuality,
  RedactionStyle,
  RedactionTarget,
} from "./types";
import { ValidatedJobEvent } from "./schemas/job-event.schema";

export const rawBatchConfigSchema = z.object({
  targets: z.array(z.enum(["face", "plate"])).min(1).default(["face", "plate"]),
  style: z.enum(["blur", "pixelate", "blackout"]).default("blur"),
  strength: z.number().int().positive().optional(),
  padding: z.number().min(0).max(0.5).default(0.1),
  quality: z.enum(["standard", "high", "max"]).default("high"),
  format: z.enum(["original", "jpg", "jpeg", "png", "webp"]).default("original"),
  confidenceThreshold: z.number().min(0).max(1).default(0.35),
  reviewThreshold: z.number().min(0).max(1).default(0.5),
  similarityThreshold: z.number().min(0).max(1).default(0.6),
});

export function parseBatchConfig(raw: unknown): BatchConfig {
  const result = rawBatchConfigSchema.safeParse(raw ?? {});
  if (!result.success) {
    const errorMsg = result.error.issues
      .map((i) => `${i.path.join(".") || "config"}: ${i.message}`)
      .join(", ");
    throw new Error(`Invalid batch config: ${errorMsg}`);
  }
  const data = result.data;
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
    throw new Error("Invalid batch config: must be a JSON object or string");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Invalid batch config: must be valid JSON");
  }
  return parseBatchConfig(parsed);
}

export function resolveOutputExtension(format: OutputFormat, inputFilenameOrExt: string): string {
  if (format === "original") {
    let ext = inputFilenameOrExt;
    if (ext.includes(".")) {
      ext = ext.slice(ext.lastIndexOf(".") + 1);
    }
    ext = ext.toLowerCase().trim();
    if (ext === "jpeg") return "jpg";
    return ext || "jpg";
  }
  const fmt = format.toLowerCase().trim();
  if (fmt === "jpeg") return "jpg";
  return fmt;
}

export interface ImageRedactCommand {
  jobId: string;
  batchId?: string;
  type: "image-redact";
  input: {
    bucket: string;
    key: string;
  };
  output: {
    bucket: string;
    key: string;
  };
  params: {
    redaction: {
      targets: RedactionTarget[];
      style: RedactionStyle;
      strength?: number;
      padding: number;
    };
    output: {
      quality: OutputQuality;
    };
    confidenceThreshold: number;
    reviewThreshold: number;
    whitelist?: {
      faces: Array<{ bucket: string; key: string }>;
      similarityThreshold: number;
    };
  };
}

export function buildImageRedactCommand(options: {
  jobId: string;
  batchId: string;
  inputKey: string;
  outputKey: string;
  config: BatchConfig;
  whitelistKeys?: string[];
}): ImageRedactCommand {
  const { jobId, batchId, inputKey, outputKey, config, whitelistKeys } = options;

  const redaction: {
    targets: RedactionTarget[];
    style: RedactionStyle;
    strength?: number;
    padding: number;
  } = {
    targets: config.targets,
    style: config.style,
    padding: config.padding,
  };
  if (config.strength !== undefined) {
    redaction.strength = config.strength;
  }

  const params: ImageRedactCommand["params"] = {
    redaction,
    output: {
      quality: config.quality,
    },
    confidenceThreshold: config.confidenceThreshold,
    reviewThreshold: config.reviewThreshold,
  };

  if (whitelistKeys && whitelistKeys.length > 0) {
    params.whitelist = {
      faces: whitelistKeys.map((key) => ({ bucket: "uploads", key })),
      similarityThreshold: config.similarityThreshold,
    };
  }

  return {
    jobId,
    batchId,
    type: "image-redact",
    input: {
      bucket: "uploads",
      key: inputKey,
    },
    output: {
      bucket: "results",
      key: outputKey,
    },
    params,
  };
}

export interface JobState {
  status: JobStatus;
  progress: number;
  stage: string | null;
  resultUrl: string | null;
  resultSummary: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
}

export function calculateNextJobState(
  current: JobState,
  event: ValidatedJobEvent,
  publicResultsBaseUrl = "/results",
): JobState {
  // Terminal state protection: first terminal event wins
  if (current.status === "COMPLETED" || current.status === "FAILED") {
    return current;
  }

  // Progress never decreases, clamped to [0, 100] and rounded to integer
  const rawProgress =
    event.progress !== undefined
      ? Math.round(event.progress)
      : current.progress;
  const clampedProgress = Math.max(
    0,
    Math.min(100, Number.isNaN(rawProgress) ? current.progress : rawProgress),
  );
  const nextProgress = Math.max(current.progress, clampedProgress);

  if (event.status === "PROCESSING") {
    return {
      ...current,
      status: "PROCESSING",
      progress: nextProgress,
      stage: event.stage ?? current.stage,
    };
  }

  if (event.status === "COMPLETED") {
    const resultUrl = event.result
      ? `${publicResultsBaseUrl}/${event.result.key}`
      : current.resultUrl;
    return {
      ...current,
      status: "COMPLETED",
      progress: 100,
      stage: event.stage ?? "DONE",
      resultUrl,
      resultSummary: event.resultSummary ?? current.resultSummary,
    };
  }

  if (event.status === "FAILED") {
    return {
      ...current,
      status: "FAILED",
      progress: nextProgress,
      stage: event.stage ?? current.stage,
      error: event.error ?? current.error,
    };
  }

  return current;
}

export function deriveBatchStatus(jobStatuses: JobStatus[]): BatchStatus {
  if (jobStatuses.length === 0) return "PROCESSING";

  const hasNonTerminal = jobStatuses.some(
    (status) => status === "PENDING" || status === "QUEUED" || status === "PROCESSING",
  );
  if (hasNonTerminal) {
    return "PROCESSING";
  }

  const hasFailed = jobStatuses.some((status) => status === "FAILED");
  if (hasFailed) {
    return "PARTIAL";
  }

  return "COMPLETED";
}
