/**
 * Express router defining endpoints for individual image jobs, downloads, and retries.
 */
import { Router } from "express";
import {
  deleteJobHandler,
  editJobHandler,
  getJobHandler,
  getJobOriginalUrlHandler,
  getJobResultUrlHandler,
  retryJobHandler,
} from "../controllers/jobs.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { RATE_LIMIT_BASES, rateLimit, userKey } from "../middleware/rate-limit.middleware";
import { validateId } from "../middleware/validate-id.middleware";

export const jobsRouter = Router();
export const editJobLimit = rateLimit(RATE_LIMIT_BASES.createBatch, userKey, "transfer");

/**
 * GET /api/jobs/:id
 * Request: None
 * Response: 200 { job: JobResponseDTO }
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
jobsRouter.get("/:id", requireAuth, validateId("Job"), getJobHandler);

/**
 * GET /api/jobs/:id/result-url
 * Request: Query ?download=1 (optional)
 * Response: 200 { url: string, expiresAt: string }
 * Errors: 400 INVALID_UUID, 401 UNAUTHORIZED, 404 NOT_FOUND
 */
jobsRouter.get("/:id/result-url", requireAuth, validateId("Job"), getJobResultUrlHandler);

/**
 * GET /api/jobs/:id/original-url
 * Request: None
 * Response: 200 { url: string, expiresAt: string }
 * Errors: 400 INVALID_UUID, 401 UNAUTHORIZED, 404 NOT_FOUND
 */
jobsRouter.get("/:id/original-url", requireAuth, validateId("Job"), getJobOriginalUrlHandler);

/**
 * POST /api/jobs/:id/retry
 * Request: None
 * Response: 201 { job: JobResponseDTO }
 * Errors: 400 INVALID_UUID / NOT_FAILED / JOB_NOT_RETRYABLE, 404 NOT_FOUND, 503 SERVICE_UNAVAILABLE
 */
jobsRouter.post("/:id/retry", requireAuth, validateId("Job"), retryJobHandler);

/**
 * POST /api/jobs/:id/edit
 * Request: JSON { redactIndices: number[], addedBoxes: { box: [x1, y1, x2, y2] }[], style?, strength?, padding? }
 * Response: 201 { job: JobResponseDTO }
 * Errors: 400 INVALID_REQUEST / INDEX_OUT_OF_RANGE, 404 NOT_FOUND, 409 JOB_NOT_EDITABLE, 410 INPUT_EXPIRED, 503 SERVICE_UNAVAILABLE
 */
jobsRouter.post("/:id/edit", requireAuth, editJobLimit, validateId("Job"), editJobHandler);

/**
 * DELETE /api/jobs/:id
 * Request: None
 * Response: 204 No Content
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND, 409 JOB_ACTIVE
 */
jobsRouter.delete("/:id", requireAuth, validateId("Job"), deleteJobHandler);
