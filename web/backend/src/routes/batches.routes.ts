/**
 * Express router defining endpoints for batch lifecycle, file uploads, and reports.
 */
import { Router } from "express";
import multer from "multer";
import { config } from "../config";
import { requireAuth } from "../middleware/auth.middleware";
import { rateLimit, userKey } from "../middleware/rate-limit.middleware";
import { validateBatchCreation, validateIdParam } from "../dto";
import { NextFunction, Request, Response } from "express";
import {
  addBatchFileHandler,
  createBatchHandler,
  deleteBatchHandler,
  getBatchHandler,
  getBatchReportHandler,
  listBatchesHandler,
  startBatchHandler,
  updateBatchHandler,
} from "../controllers/batches.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_BYTES },
});

export const batchesRouter = Router();
// Moderate, per account: a 100-image batch uploads one file per request, so this leaves room for a few batches a
// minute while capping a runaway client.
const createBatchLimit = rateLimit(60_000, 20, userKey);
const uploadLimit = rateLimit(60_000, 300, userKey);
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
 * GET /api/batches
 * Request: Query { limit?: number, cursor?: string }
 * Response: 200 { batches: BatchSummaryItemDTO[], nextCursor: string | null, usage: AccountUsageDTO }
 * Errors: 400 VALIDATION_ERROR, 401 UNAUTHORIZED
 */
batchesRouter.get("/", requireAuth, listBatchesHandler);

/**
 * POST /api/batches
 * Request: multipart/form-data with optional files, whitelist (max 5), config JSON, name
 * Response: 201 { batch: BatchResponseDTO }
 * Errors: 400 VALIDATION_ERROR, 409 BATCH_FULL, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post(
  "/",
  // Auth runs before multer so an anonymous request is rejected before its files are buffered in memory.
  requireAuth,
  createBatchLimit,
  upload.fields([
    { name: "files", maxCount: config.BATCH_MAX_FILES },
    { name: "whitelist", maxCount: 5 },
  ]),
  validateCreateRequest,
  createBatchHandler,
);

/**
 * POST /api/batches/:id/files
 * Request: multipart/form-data with single file
 * Response: 201 { batch: BatchResponseDTO }
 * Errors: 400 VALIDATION_ERROR / INVALID_UUID, 404 NOT_FOUND, 409 BATCH_STARTED / BATCH_FULL, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post("/:id/files", requireAuth, uploadLimit, validateId, upload.single("file"), addBatchFileHandler);

/**
 * POST /api/batches/:id/start
 * Request: None
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID / BATCH_EMPTY, 404 NOT_FOUND, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post("/:id/start", requireAuth, validateId, startBatchHandler);

/**
 * GET /api/batches/:id
 * Request: None
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.get("/:id", requireAuth, validateId, getBatchHandler);

/**
 * PATCH /api/batches/:id
 * Request: JSON { name: string }
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID / VALIDATION_ERROR, 404 NOT_FOUND
 */
batchesRouter.patch("/:id", requireAuth, validateId, updateBatchHandler);

/**
 * GET /api/batches/:id/report
 * Request: None
 * Response: 200 { report: BatchReportResponseDTO }
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.get("/:id/report", requireAuth, validateId, getBatchReportHandler);

/**
 * DELETE /api/batches/:id
 * Request: None
 * Response: 204 No Content
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.delete("/:id", requireAuth, validateId, deleteBatchHandler);
