/**
 * Worker dispatch command schema and serializer for image redaction tasks.
 */
import { BatchConfig, OutputFormat, OutputQuality, RedactionStyle, RedactionTarget } from "../types";

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
