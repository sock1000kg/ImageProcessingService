/**
 * Express router defining endpoints for batch lifecycle, file uploads, and reports.
 */
import { Router } from "express";
import multer from "multer";
import { config } from "../config";
import { requireAuth } from "../middleware/auth.middleware";
import { RATE_LIMIT_BASES, rateLimit, userKey } from "../middleware/rate-limit.middleware";
import { MAX_WHITELIST_FILES, parseFaceListIds, validateBatchCreation, validateIdParam } from "../dto";
import { NextFunction, Request, Response } from "express";
import {
  addBatchFileHandler,
  createBatchDownloadTokenHandler,
  createBatchHandler,
  deleteBatchHandler,
  downloadBatchZipHandler,
  getBatchHandler,
  getBatchReportHandler,
  getBatchWhitelistPhotoHandler,
  getBatchWhitelistPhotoUrlHandler,
  listBatchesHandler,
  rerunBatchHandler,
  startBatchHandler,
  updateBatchHandler,
} from "../controllers/batches.controller";

/**
 * Multer multipart upload parser for batch image files and whitelist images.
 *
 * Why defParamCharset utf8: Preserves non-ASCII (e.g. Vietnamese) characters in originalFilename
 * for display in the UI, report generation, and zip exports.
 */
export const batchesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_BYTES },
  defParamCharset: "utf8",
});

export const batchesRouter = Router();
// Moderate, per account: caps runaway clients creating batches or uploading files while leaving room for normal usage.
export const createBatchLimit = rateLimit(RATE_LIMIT_BASES.createBatch, userKey, "transfer");
export const uploadLimit = rateLimit(RATE_LIMIT_BASES.upload, userKey, "transfer");
export const downloadTokenLimit = rateLimit(RATE_LIMIT_BASES.downloadToken, userKey, "transfer");
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
    const faceListIds = parseFaceListIds(request.body);
    validateBatchCreation({
      filesPresent: (filesMap?.files?.length ?? 0) > 0 || request.body?.files !== undefined,
      whitelist: filesMap?.whitelist ?? [],
      faceListIds,
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
 * Request: multipart/form-data with optional files, whitelist (max 20), config JSON, name
 * Response: 201 { batch: BatchResponseDTO }
 * Errors: 400 VALIDATION_ERROR, 409 BATCH_FULL, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post(
  "/",
  // Auth runs before multer so an anonymous request is rejected before its files are buffered in memory.
  requireAuth,
  createBatchLimit,
  batchesUpload.fields([
    { name: "files", maxCount: config.BATCH_MAX_FILES },
    { name: "whitelist", maxCount: MAX_WHITELIST_FILES },
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
batchesRouter.post(
  "/:id/files",
  requireAuth,
  uploadLimit,
  validateId,
  batchesUpload.single("file"),
  addBatchFileHandler,
);

/**
 * POST /api/batches/:id/start
 * Request: None
 * Response: 200 { batch: BatchResponseDTO }
 * Errors: 400 INVALID_UUID / BATCH_EMPTY, 404 NOT_FOUND, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post("/:id/start", requireAuth, validateId, startBatchHandler);

/**
 * POST /api/batches/:id/rerun
 * Request: multipart/form-data with optional whitelist (max 20), config JSON, name
 * Response: 201 { batch: BatchResponseDTO, skipped: number }
 * Errors: 400 VALIDATION_ERROR / INVALID_UUID, 404 NOT_FOUND, 409 BATCH_NOT_STARTED, 410 NO_ORIGINALS, 503 SERVICE_UNAVAILABLE
 */
batchesRouter.post(
  "/:id/rerun",
  requireAuth,
  createBatchLimit,
  validateId,
  batchesUpload.fields([{ name: "whitelist", maxCount: MAX_WHITELIST_FILES }]),
  rerunBatchHandler,
);

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
 * GET /api/batches/:id/whitelist/:n
 * Request: None
 * Response: 200 (image stream with Cache-Control: private, no-store)
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
batchesRouter.get("/:id/whitelist/:n", requireAuth, getBatchWhitelistPhotoHandler);

/**
 * GET /api/batches/:id/whitelist/:n/url
 * Request: None
 * Response: 200 { url: string, expiresAt: string }
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
batchesRouter.get("/:id/whitelist/:n/url", requireAuth, getBatchWhitelistPhotoUrlHandler);

/**
 * DELETE /api/batches/:id
 * Request: None
 * Response: 204 No Content
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
batchesRouter.delete("/:id", requireAuth, validateId, deleteBatchHandler);

/**
 * POST /api/batches/:id/download-token
 * Request: None
 * Response: 200 { url: string }
 * Errors: 400 INVALID_UUID, 401 UNAUTHORIZED, 404 NOT_FOUND, 429 RATE_LIMITED
 */
batchesRouter.post("/:id/download-token", requireAuth, downloadTokenLimit, validateId, createBatchDownloadTokenHandler);

/**
 * GET /api/batches/:id/download.zip?token=...
 * Request: Query { token: string }
 * Response: 200 (zip stream)
 * Errors: 400 INVALID_UUID, 401 INVALID_DOWNLOAD_TOKEN, 404 NOT_FOUND / NO_RESULTS
 */
batchesRouter.get("/:id/download.zip", validateId, downloadBatchZipHandler);
