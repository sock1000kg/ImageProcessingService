import { z } from "zod";

export const jobEventSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["PROCESSING", "COMPLETED", "FAILED"]),
  batchId: z.string().uuid().optional().catch(undefined),
  progress: z.number().optional().catch(undefined),
  stage: z.string().optional().catch(undefined),
  result: z.object({ bucket: z.string(), key: z.string() }).optional().catch(undefined),
  resultSummary: z.record(z.string(), z.unknown()).optional().catch(undefined),
  error: z.object({ code: z.string(), message: z.string() }).optional().catch(undefined),
  timestamp: z.string().optional().catch(undefined),
});

export type ValidatedJobEvent = z.infer<typeof jobEventSchema>;
