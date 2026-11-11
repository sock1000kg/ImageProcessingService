import { Router } from "express";
import express from "express";
import { config } from "../config";
import { requireAuth } from "../middleware/auth.middleware";
import {
  cancelUploadHandler,
  completeUploadHandler,
  startUploadHandler,
  uploadPartHandler,
} from "../controllers/uploads.controller";

export const uploadsRouter = Router();

/** POST /api/uploads/start  { batchId, filename, contentType, totalBytes } -> 201 { uploadId, chunkBytes } */
uploadsRouter.post("/start", requireAuth, startUploadHandler);

/** PUT /api/uploads/:id/parts/:part  raw chunk (at most UPLOAD_CHUNK_BYTES) -> 200 { partNumber, etag } */
uploadsRouter.put(
  "/:id/parts/:part",
  requireAuth,
  express.raw({ type: "application/octet-stream", limit: config.UPLOAD_CHUNK_BYTES }),
  uploadPartHandler,
);

/** POST /api/uploads/:id/complete  { parts: [{ partNumber, etag }] } -> 201 { job } */
uploadsRouter.post("/:id/complete", requireAuth, completeUploadHandler);

/** DELETE /api/uploads/:id -> 204 */
uploadsRouter.delete("/:id", requireAuth, cancelUploadHandler);
