/**
 * Streaming utility for sending private storage objects to HTTP clients with no-store caching headers.
 *
 * Why private, no-store: Biometric reference imagery and user-uploaded originals are sensitive
 * personal data that must never be cached by shared intermediate proxy caches or client browsers.
 */
import { NextFunction, Response } from "express";

export interface StreamInfo {
  stream: NodeJS.ReadableStream;
  contentType?: string;
  contentLength?: number;
}

/**
 * Pipes a readable stream from MinIO/S3 to the Express response, enforcing private no-store headers.
 */
export function streamPrivateObject(response: Response, next: NextFunction, streamInfo: StreamInfo): void {
  response.setHeader("Cache-Control", "private, no-store");
  if (streamInfo.contentType) {
    response.setHeader("Content-Type", streamInfo.contentType);
  }
  if (streamInfo.contentLength !== undefined) {
    response.setHeader("Content-Length", streamInfo.contentLength);
  }

  streamInfo.stream.on("error", (error) => {
    next(error);
  });

  streamInfo.stream.pipe(response);
}
