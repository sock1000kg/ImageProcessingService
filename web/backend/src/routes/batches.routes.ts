/**
 * Express router defining endpoints for batch lifecycle, file uploads, and reports.
 */
import { Router } from "express";
import multer from "multer";
import { config } from "../config";
import { requireAuth } from "../middleware/auth.middleware";
import { validateBatchCreation, validateIdParam } from "../dto";
import { NextFunction, Request, Response } from "express";
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
function validateId(request: Request, _response: Response, next: NextFunction): void {
  try {
    validateIdParam(request.params);
    next();
  } catch (error) {
    next(error);
  }
}

function validateCreateRequest(request: Request, _response: Response, next: NextFunction): void {
  try {
    const filesMap = request.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    validateBatchCreation({
      filesPresent: (filesMap?.files?.length ?? 0) > 0 || request.body?.files !== undefined,
      whitelist: filesMap?.whitelist ?? [],
    });
    next();
  } catch (error) {
    next(error);
  }
}

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
  validateCreateRequest,
  requireAuth,
  createBatchHandler,
);

/**
 * POST /api/batches/:id/files
 * Request: multipart/form-data with single file
 * Response: 201 { batch: BatchResponseDTO }
 * Errors: 400 VALIDATION_ERROR / INVALID_UUID, 404 NOT_FOUND, 409 BATCH_STARTED / BATCH_FULL, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post("/:id/files", upload.single("file"), validateId, requireAuth, addBatchFileHandler);

/**
 * POST /api/batches/:id/start
 * Request: None
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID / BATCH_EMPTY, 404 NOT_FOUND, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post("/:id/start", validateId, requireAuth, startBatchHandler);

/**
 * GET /api/batches/:id
 * Request: None
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.get("/:id", validateId, requireAuth, getBatchHandler);

/**
 * PATCH /api/batches/:id
 * Request: JSON { name: string }
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID / VALIDATION_ERROR, 404 NOT_FOUND
 */
batchesRouter.patch("/:id", validateId, requireAuth, updateBatchHandler);

/**
 * GET /api/batches/:id/report
 * Request: None
 * Response: 200 { report: BatchReportResponseDTO }
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.get("/:id/report", validateId, requireAuth, getBatchReportHandler);

/**
 * DELETE /api/batches/:id
 * Request: None
 * Response: 204 No Content
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.delete("/:id", validateId, requireAuth, deleteBatchHandler);
