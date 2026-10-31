/**
 * Worker event validation schema parsing telemetry emitted by engine workers over NATS.
 */
import { z } from "zod";
import { imageResultSummarySchema, jobErrorSchema } from "./batch.dto";

export const jobEventSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["PROCESSING", "COMPLETED", "FAILED"]),
  batchId: z.string().uuid().optional(),
  progress: z.number().optional(),
  stage: z.string().optional(),
  result: z.object({ bucket: z.string(), key: z.string() }).optional(),
  resultSummary: imageResultSummarySchema.optional(),
  error: jobErrorSchema.optional(),
  timestamp: z.string().optional(),
});

export type ValidatedJobEvent = z.infer<typeof jobEventSchema>;
