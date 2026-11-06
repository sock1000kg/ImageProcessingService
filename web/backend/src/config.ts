/**
 * Runtime environment configuration schema validation and default settings.
 */
import "dotenv/config";

import { z } from "zod";

export const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default("postgresql://imgproc:CHANGE_ME_imgproc_local@localhost:5432/imgproc"),
  NATS_URL: z.string().min(1).default("nats://localhost:4222"),
  MINIO_ENDPOINT: z.string().min(1).default("localhost"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1).default("imgproclocal"),
  MINIO_SECRET_KEY: z.string().min(1).default("CHANGE_ME_minio_local"),
  MINIO_USE_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLIC_RESULTS_BASE_URL: z.string().min(1).default("/results"),
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
  BATCH_MAX_FILES: z.coerce.number().int().positive().default(100),
  // Global multiplier scaling all per-minute base limits (1 = defaults, 100 = load tests, 0.5 = stricter).
  RATE_LIMIT_MULTIPLIER: z.coerce.number().positive().default(1),
  CLEANUP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60 * 1000),
  RETENTION_DAYS: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : val),
    z.coerce.number().int().positive().optional(),
  ),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  JWT_REFRESH_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  REGISTER_KEY: z.string().min(1).optional(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Header holding the real client IP when the API sits behind a proxy that sets it (the lab: Cloudflare's
  // cf-connecting-ip). Empty = use the socket address, which is right for local runs.
  CLIENT_IP_HEADER: z
    .string()
    .default("")
    .transform((value) => value.trim().toLowerCase()),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const config = parsed.data;
