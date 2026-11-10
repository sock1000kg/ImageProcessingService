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
    // Per-class detection thresholds per Contract §2A
    confidenceThresholds: {
      face: number;
      plate: number;
    };
    reviewThreshold: number;
    whitelist?: {
      faces: Array<{ bucket: string; key: string }>;
      similarityThreshold: number;
      plates?: string[];
    };
  };
}

export interface VideoRedactCommand extends Omit<ImageRedactCommand, "type" | "output"> {
  type: "video-redact";
  output: ImageRedactCommand["output"];
}

export function buildVideoRedactCommand(options: {
  jobId: string;
  batchId: string;
  inputKey: string;
  outputKey: string;
  config: BatchConfig;
  whitelistKeys?: string[];
}): VideoRedactCommand {
  const image = buildImageRedactCommand(options);
  return { ...image, type: "video-redact", output: { bucket: "results", key: options.outputKey } };
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

  // Why: Replaces single threshold with per-class face and plate thresholds per Contract §2A.
  const params: ImageRedactCommand["params"] = {
    redaction,
    output: {
      quality: config.quality,
    },
    confidenceThresholds: {
      face: config.faceConfidenceThreshold,
      plate: config.plateConfidenceThreshold,
    },
    reviewThreshold: config.reviewThreshold,
  };

  if ((whitelistKeys && whitelistKeys.length > 0) || config.whitelistPlates.length > 0) {
    params.whitelist = {
      faces: (whitelistKeys ?? []).map((key) => ({ bucket: "uploads", key })),
      similarityThreshold: config.similarityThreshold,
      ...(config.whitelistPlates.length > 0 ? { plates: config.whitelistPlates } : {}),
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

/**
 * Single bounding box in original image pixels passed to the image-render worker.
 */
export interface RenderBox {
  label: string;
  box: [number, number, number, number];
}

/**
 * Worker dispatch command for re-rendering an image with explicit bounding boxes per Contract §2C.
 */
export interface ImageRenderCommand {
  jobId: string;
  batchId?: string;
  type: "image-render";
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
      style: RedactionStyle;
      strength?: number;
      padding: number;
    };
    output: {
      quality: OutputQuality;
    };
    boxes: RenderBox[];
  };
}

/**
 * Serializes an image-render command to re-render a completed image without re-running AI detection.
 *
 * Why boxes instead of detection thresholds: The render job applies redaction filters to pre-selected
 * boxes (existing kept detections plus user additions) directly, bypassing neural inference.
 */
export function buildImageRenderCommand(options: {
  jobId: string;
  batchId: string;
  inputKey: string;
  outputKey: string;
  redaction: {
    style: RedactionStyle;
    strength?: number;
    padding: number;
  };
  quality: OutputQuality;
  boxes: RenderBox[];
}): ImageRenderCommand {
  const { jobId, batchId, inputKey, outputKey, redaction, quality, boxes } = options;

  const redactionParams: {
    style: RedactionStyle;
    strength?: number;
    padding: number;
  } = {
    style: redaction.style,
    padding: redaction.padding,
  };
  if (redaction.strength !== undefined) {
    redactionParams.strength = redaction.strength;
  }

  return {
    jobId,
    batchId,
    type: "image-render",
    input: {
      bucket: "uploads",
      key: inputKey,
    },
    output: {
      bucket: "results",
      key: outputKey,
    },
    params: {
      redaction: redactionParams,
      output: {
        quality,
      },
      boxes,
    },
  };
}
