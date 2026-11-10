/**
 * Central backend domain and DTO type exports.
 */
export { JobStatus } from "./generated/prisma/client";

/**
 * Composite lifecycle status of a batch computed across all child jobs.
 */
export type BatchStatus = "DRAFT" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED";

export type {
  RedactionTarget,
  RedactionStyle,
  OutputQuality,
  OutputFormat,
  DetectionMode,
  BatchConfig,
} from "./dto/batch-config.dto";

export type { ValidatedJobEvent as JobEvent } from "./dto/job-event.dto";

declare module "multer" {
  interface Options {
    defParamCharset?: string;
  }
}
