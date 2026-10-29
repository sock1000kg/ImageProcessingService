import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

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
      const objects = listResponse.Contents
        .filter((item: { Key?: string }) => Boolean(item.Key))
        .map((item: { Key?: string }) => ({ Key: item.Key! }));

      if (objects.length > 0) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }
    }

    isTruncated = listResponse.IsTruncated;
    continuationToken = listResponse.NextContinuationToken;
  }
}

export async function verifyBuckets(): Promise<void> {
  for (const bucket of [UPLOADS_BUCKET, RESULTS_BUCKET]) {
    if (!(await bucketExists(bucket))) {
      throw new Error(`MinIO bucket ${bucket} is missing`);
    }
  }
}

export const storage = {
  bucketExists,
  putObject,
  getObjectStream,
  deletePrefix,
  verifyBuckets,
};
