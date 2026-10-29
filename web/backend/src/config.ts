import "dotenv/config";

import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default("postgresql://imgproc:CHANGE_ME_imgproc_local@localhost:5432/imgproc"),
  NATS_URL: z.string().min(1).default("nats://localhost:4222"),
  MINIO_ENDPOINT: z.string().min(1).default("localhost"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1).default("imgproclocal"),
  MINIO_SECRET_KEY: z.string().min(1).default("CHANGE_ME_minio_local"),
  MINIO_USE_SSL: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  PUBLIC_RESULTS_BASE_URL: z.string().min(1).default("/results"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  BATCH_MAX_FILES: z.coerce.number().int().positive().default(20),
  BATCH_MAX_BYTES: z.coerce.number().int().positive().default(90 * 1024 * 1024),
  CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const config = parsed.data;
