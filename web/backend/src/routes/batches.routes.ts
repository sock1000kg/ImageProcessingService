/**
 * Express router defining endpoints for batch lifecycle, file uploads, and reports.
 */
import { Router } from "express";
import multer from "multer";
import { config } from "../config";
import {
  addBatchFileHandler,
  createBatchHandler,
  deleteBatchHandler,
  getBatchHandler,
  getBatchReportHandler,
  startBatchHandler,
  updateBatchHandler,
} from "../controllers/batches.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_BYTES },
});

export const batchesRouter = Router();

/**
 * POST /api/batches
 * Request: multipart/form-data with optional files, whitelist (max 5), config JSON, name
 * Response: 201 { batch: BatchResponseDTO }
 * Errors: 400 VALIDATION_ERROR, 409 BATCH_FULL, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post(
  "/",
  upload.fields([
    { name: "files", maxCount: config.BATCH_MAX_FILES },
    { name: "whitelist", maxCount: 5 },
  ]),
  createBatchHandler,
);

/**
 * POST /api/batches/:id/files
 * Request: multipart/form-data with single file
 * Response: 201 { batch: BatchResponseDTO }
 * Errors: 400 VALIDATION_ERROR / INVALID_UUID, 404 NOT_FOUND, 409 BATCH_STARTED / BATCH_FULL, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post("/:id/files", upload.single("file"), addBatchFileHandler);

/**
 * POST /api/batches/:id/start
 * Request: None
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID / BATCH_EMPTY, 404 NOT_FOUND, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post("/:id/start", startBatchHandler);

/**
 * GET /api/batches/:id
 * Request: None
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.get("/:id", getBatchHandler);

/**
 * PATCH /api/batches/:id
 * Request: JSON { name: string }
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID / VALIDATION_ERROR, 404 NOT_FOUND
 */
batchesRouter.patch("/:id", updateBatchHandler);

/**
 * GET /api/batches/:id/report
 * Request: None
 * Response: 200 { report: BatchReportResponseDTO }
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.get("/:id/report", getBatchReportHandler);

/**
 * DELETE /api/batches/:id
 * Request: None
 * Response: 204 No Content
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.delete("/:id", deleteBatchHandler);
