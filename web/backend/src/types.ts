export { JobStatus } from "./generated/prisma/client";

export type BatchStatus = "PROCESSING" | "COMPLETED" | "PARTIAL";

export type {
  RedactionTarget,
  RedactionStyle,
  OutputQuality,
  OutputFormat,
  BatchConfig,
} from "./dto/batch-config.dto";

export type { ValidatedJobEvent as JobEvent } from "./dto/job-event.dto";
