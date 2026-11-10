import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { beginUpload, cancelUpload, finishUpload, writeUploadPart } from "../services/upload.service";
import { badRequest } from "../errors";

export const uploadsRouter = Router();
const jsonParts = (value: unknown): Array<{ partNumber: number; etag: string }> => {
  if (!Array.isArray(value)) throw badRequest("parts must be an array");
  return value.map((part) => {
    if (!part || typeof part !== "object") throw badRequest("Invalid upload part");
    const item = part as { partNumber?: unknown; etag?: unknown };
    if (typeof item.partNumber !== "number" || typeof item.etag !== "string") throw badRequest("Invalid upload part");
    return { partNumber: item.partNumber, etag: item.etag };
  });
};

function wrap(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => void handler(request, response).catch(next);
}

uploadsRouter.post(
  "/start",
  requireAuth,
  wrap(async (request, response) => {
    const { batchId, filename, contentType, totalBytes } = request.body ?? {};
    const session = await beginUpload(request.authUser!.id, batchId, filename, contentType, totalBytes);
    response.status(201).json({ uploadId: session.id, chunkBytes: 8 * 1024 * 1024 });
  }),
);

uploadsRouter.put(
  "/:id/parts/:part",
  requireAuth,
  express.raw({ type: "application/octet-stream", limit: "16mb" }),
  wrap(async (request, response) => {
    const partNumber = Number(String(request.params.part));
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);
    const etag = await writeUploadPart(request.authUser!.id, String(request.params.id), partNumber, body);
    response.status(200).json({ partNumber, etag });
  }),
);

uploadsRouter.post(
  "/:id/complete",
  requireAuth,
  wrap(async (request, response) => {
    const job = await finishUpload(request.authUser!.id, String(request.params.id), jsonParts(request.body?.parts));
    response.status(201).json({ job });
  }),
);

uploadsRouter.delete(
  "/:id",
  requireAuth,
  wrap(async (request, response) => {
    await cancelUpload(request.authUser!.id, String(request.params.id));
    response.status(204).end();
  }),
);
