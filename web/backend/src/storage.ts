/**
 * S3-compatible object storage client (MinIO/AWS S3) wrapper and bucket utilities.
 */
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { config } from "./config";

export const UPLOADS_BUCKET = "uploads";
export const RESULTS_BUCKET = "results";

const endpoint = `${config.MINIO_USE_SSL ? "https" : "http"}://${config.MINIO_ENDPOINT}:${config.MINIO_PORT}`;

export const s3Client = new S3Client({
  endpoint,
  region: "us-east-1",
  credentials: {
    accessKeyId: config.MINIO_ACCESS_KEY,
    secretAccessKey: config.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

/**
 * Public S3 client configured with S3_PUBLIC_ENDPOINT used exclusively for generating presigned URLs.
 *
 * Why a second client: The browser-facing signature covers host and path. Signing with a client
 * configured with S3_PUBLIC_ENDPOINT ensures browser GET requests validate correctly, while normal
 * internal reads and writes keep using s3Client on the internal cluster endpoint.
 */
export const s3PublicClient = new S3Client({
  endpoint: config.S3_PUBLIC_ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: config.MINIO_ACCESS_KEY,
    secretAccessKey: config.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function bucketExists(bucket: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (error: unknown) {
    const err = error as { $metadata?: { httpStatusCode?: number }; name?: string };
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
      return false;
    }
    throw error;
  }
}

export async function putObject(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectStream(
  bucket: string,
  key: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType?: string; contentLength?: number } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    if (!response.Body) return null;
    return {
      // AWS SDK v3 response.Body is a Readable/IncomingMessage; cast to NodeJS.ReadableStream
      stream: response.Body as unknown as NodeJS.ReadableStream,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (error: unknown) {
    const err = error as { $metadata?: { httpStatusCode?: number }; name?: string };
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error: unknown) {
    const err = error as { $metadata?: { httpStatusCode?: number }; name?: string };
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
      return false;
    }
    throw error;
  }
}

export async function statObject(bucket: string, key: string): Promise<number | null> {
  try {
    const response = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return typeof response.ContentLength === "number" ? response.ContentLength : null;
  } catch {
    return null;
  }
}

export async function deletePrefix(bucket: string, prefix: string): Promise<void> {
  let continuationToken: string | undefined = undefined;
  let isTruncated: boolean | undefined = true;
  while (isTruncated) {
    const listCommand: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const listResponse = await s3Client.send(listCommand);

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      const objects = listResponse.Contents.filter((item: { Key?: string }) => Boolean(item.Key)).map(
        (item: { Key?: string }) => ({ Key: item.Key! }),
      );

      if (objects.length > 0) {
        const deleteResponse = await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        // Why: a bulk delete reports per-object failures in the response without throwing, so callers
        // would otherwise treat leftover files, possibly private originals, as deleted.
        const failures = deleteResponse.Errors ?? [];
        if (failures.length > 0) {
          const first = failures[0];
          throw new Error(
            `Failed to delete ${failures.length} object(s) under ${bucket}/${prefix}: first ${first.Key} (${first.Code})`,
          );
        }
      }
    }

    isTruncated = listResponse.IsTruncated;
    continuationToken = listResponse.NextContinuationToken;
  }
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

/**
 * Copies an existing object within a bucket without streaming bytes through the Node server.
 *
 * Why server-side copy: S3 CopyObject delegates duplication directly to storage, preserving
 * network bandwidth and avoiding memory pressure when re-running batches from stored originals.
 */
export async function copyObject(bucket: string, sourceKey: string, destKey: string): Promise<void> {
  const cleanSourceKey = sourceKey.startsWith("/") ? sourceKey.slice(1) : sourceKey;
  const cleanDestKey = destKey.startsWith("/") ? destKey.slice(1) : destKey;
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: encodeURI(`${bucket}/${cleanSourceKey}`),
      Key: cleanDestKey,
    }),
  );
}

export async function createMultipartUpload(bucket: string, key: string, contentType: string): Promise<string> {
  const response = await s3Client.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
  );
  if (!response.UploadId) throw new Error("Storage did not return a multipart upload ID");
  return response.UploadId;
}

export async function uploadPart(
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer,
): Promise<string> {
  const response = await s3Client.send(
    new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body }),
  );
  if (!response.ETag) throw new Error("Storage did not return a multipart part ETag");
  return response.ETag;
}

export async function completeMultipartUpload(
  bucket: string,
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<void> {
  await s3Client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }),
  );
}

export async function abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void> {
  await s3Client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
}

export async function verifyBuckets(): Promise<void> {
  for (const bucket of [UPLOADS_BUCKET, RESULTS_BUCKET]) {
    if (!(await bucketExists(bucket))) {
      throw new Error(`MinIO bucket ${bucket} is missing`);
    }
  }
}

/**
 * Options controlling expiration and response header overrides for presigned GET URLs.
 */
export interface PresignGetUrlOptions {
  ttlSeconds: number;
  cacheControl?: string;
  contentDisposition?: string;
}

/**
 * Result returned by presignGetUrl containing the signed URL and ISO timestamp of expiration.
 */
export interface PresignedUrlResult {
  url: string;
  expiresAt: string;
}

/**
 * Generates an AWS SigV4 presigned GET URL for an object without sending network requests to MinIO.
 *
 * Why local presigning: Presigning is a purely cryptographic operation on the client; no storage
 * roundtrip is needed. The signature is computed against S3_PUBLIC_ENDPOINT with optional override
 * headers (ResponseCacheControl, ResponseContentDisposition).
 */
export async function presignGetUrl(
  bucket: string,
  key: string,
  options: PresignGetUrlOptions,
): Promise<PresignedUrlResult> {
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: cleanKey,
    ...(options.cacheControl ? { ResponseCacheControl: options.cacheControl } : {}),
    ...(options.contentDisposition ? { ResponseContentDisposition: options.contentDisposition } : {}),
  });

  const url = await getSignedUrl(s3PublicClient, command, {
    expiresIn: options.ttlSeconds,
  });
  const expiresAt = new Date(Date.now() + options.ttlSeconds * 1000).toISOString();

  return { url, expiresAt };
}

export const storage = {
  bucketExists,
  putObject,
  getObjectStream,
  objectExists,
  statObject,
  deleteObject,
  copyObject,
  deletePrefix,
  verifyBuckets,
  presignGetUrl,
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
};
