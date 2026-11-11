/**
 * HTTP controllers for chunked video uploads (see services/upload.service.ts for the flow).
 */
import { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { badRequest } from "../errors";
import {
  beginMultipartUpload,
  cancelMultipartUpload,
  finishMultipartUpload,
  writeMultipartPart,
} from "../services/upload.service";

/** Reads the `parts` list the browser sends at completion ({ partNumber, etag } for each uploaded chunk). */
function jsonParts(value: unknown): Array<{ partNumber: number; etag: string }> {
  if (!Array.isArray(value)) throw badRequest("parts must be an array");
  return value.map((part) => {
    if (!part || typeof part !== "object") throw badRequest("Invalid upload part");
    const item = part as { partNumber?: unknown; etag?: unknown };
    if (typeof item.partNumber !== "number" || typeof item.etag !== "string") throw badRequest("Invalid upload part");
    return { partNumber: item.partNumber, etag: item.etag };
  });
}

export async function startUploadHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const { batchId, filename, contentType, totalBytes } = request.body ?? {};
    const session = await beginMultipartUpload(request.authUser!.id, batchId, filename, contentType, totalBytes);
    response.status(201).json({ uploadId: session.id, chunkBytes: config.UPLOAD_CHUNK_BYTES });
  } catch (error) {
    next(error);
  }
}

export async function uploadPartHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const partNumber = Number(String(request.params.part));
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);
    const etag = await writeMultipartPart(request.authUser!.id, String(request.params.id), partNumber, body);
    response.status(200).json({ partNumber, etag });
  } catch (error) {
    next(error);
  }
}

export async function completeUploadHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const parts = jsonParts(request.body?.parts);
    const job = await finishMultipartUpload(request.authUser!.id, String(request.params.id), parts);
    response.status(201).json({ job });
  } catch (error) {
    next(error);
  }
}

export async function cancelUploadHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    await cancelMultipartUpload(request.authUser!.id, String(request.params.id));
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}
