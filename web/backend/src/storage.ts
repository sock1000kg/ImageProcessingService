import { Client } from "minio";

import { config } from "./config";

export const UPLOADS_BUCKET = "uploads";
export const RESULTS_BUCKET = "results";

export const storage = new Client({
  endPoint: config.MINIO_ENDPOINT,
  port: config.MINIO_PORT,
  useSSL: config.MINIO_USE_SSL,
  accessKey: config.MINIO_ACCESS_KEY,
  secretKey: config.MINIO_SECRET_KEY,
});

export async function ensureBuckets(): Promise<void> {
  for (const bucket of [UPLOADS_BUCKET, RESULTS_BUCKET]) {
    if (!(await storage.bucketExists(bucket))) {
      await storage.makeBucket(bucket);
    }
  }
}
