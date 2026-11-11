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
  FFPROBE_BIN: z.string().min(1).default("ffprobe"),
  // Browser-facing S3/MinIO endpoint used for generating presigned URLs (host + port/path).
  S3_PUBLIC_ENDPOINT: z.string().min(1).default("http://localhost:9000"),
  // Lifetime in seconds for presigned URLs granting access to completed result images (default: 1 hour).
  PRESIGN_RESULT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  // Lifetime in seconds for presigned URLs granting access to private originals/whitelist faces (default: 5 min).
  PRESIGN_PRIVATE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  IMAGE_UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
  BATCH_MAX_FILES: z.coerce.number().int().positive().default(1000),
  // Per-video size limit. Separate from IMAGE_UPLOAD_MAX_BYTES because videos are sent in chunks (each request stays small),
  // so they can be much larger than a photo, which travels in a single request.
  VIDEO_UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(200 * 1024 * 1024),
  // Size of each chunk the browser sends when uploading a video. Must be at least 5 MB (S3's minimum for every part but
  // the last) and, behind Cloudflare's free plan, well under 100 MB (its per-request limit). Without such a proxy it can
  // be raised so very large videos stay under S3's 10,000-part ceiling (checked below).
  UPLOAD_CHUNK_BYTES: z.coerce
    .number()
    .int()
    .min(5 * 1024 * 1024)
    .default(8 * 1024 * 1024),
  // Accepted video length. A cap on duration (not bytes) because processing time grows with the number of frames.
  VIDEO_MIN_DURATION_SECONDS: z.coerce.number().positive().default(15),
  VIDEO_MAX_DURATION_SECONDS: z.coerce.number().positive().default(60),
  // General multiplier scaling login, refresh, and allow list creation per-minute base limits.
  RATE_LIMIT_MULTIPLIER: z.coerce.number().positive().default(1),
  // Multiplier scaling transfer-heavy per-minute base limits (batch create, file uploads, zip downloads).
  TRANSFER_RATE_LIMIT_MULTIPLIER: z.coerce.number().positive().default(1),
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

// S3 allows at most 10,000 parts per multipart upload, so the biggest accepted video must fit in that many chunks.
export const S3_MAX_PARTS = 10_000;

const parsed = configSchema
  .refine((env) => Math.ceil(env.VIDEO_UPLOAD_MAX_BYTES / env.UPLOAD_CHUNK_BYTES) <= S3_MAX_PARTS, {
    message: `VIDEO_UPLOAD_MAX_BYTES / UPLOAD_CHUNK_BYTES must not exceed ${S3_MAX_PARTS} parts (S3's limit); raise UPLOAD_CHUNK_BYTES`,
  })
  .safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const config = parsed.data;

/** A size limit as people read it, e.g. "50 MB", for error messages (defaults to the photo limit). */
export function uploadLimitLabel(bytes: number = config.IMAGE_UPLOAD_MAX_BYTES): string {
  const mb = bytes / (1024 * 1024);
  return `${Number(mb.toFixed(1))} MB`;
}
