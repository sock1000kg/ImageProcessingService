import { z } from "zod";

export const jobEventSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["PROCESSING", "COMPLETED", "FAILED"]),
  progress: z.number().int().min(0).max(100).optional(),
  stage: z.string().optional(),
  result: z.object({ bucket: z.string().min(1), key: z.string().min(1) }).optional(),
  resultSummary: z.record(z.unknown()).optional(),
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
});

export type ValidatedJobEvent = z.infer<typeof jobEventSchema>;
