/**
 * Express router defining endpoints for individual image jobs, downloads, and retries.
 */
import { Router } from "express";
import {
  deleteJobHandler,
  getJobHandler,
  getJobOriginalHandler,
  getJobOriginalUrlHandler,
  getJobResultUrlHandler,
  retryJobHandler,
} from "../controllers/jobs.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validateIdParam } from "../dto";
import { NextFunction, Request, Response } from "express";

export const jobsRouter = Router();
function validateId(request: Request, _response: Response, next: NextFunction): void {
  try {
    validateIdParam(request.params);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/jobs/:id
 * Request: None
 * Response: 200 { job: JobResponseDTO }
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
jobsRouter.get("/:id", requireAuth, validateId, getJobHandler);

/**
 * GET /api/jobs/:id/original
 * Request: None
 * Response: 200 binary image stream with Content-Type and Content-Disposition headers
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
jobsRouter.get("/:id/original", requireAuth, validateId, getJobOriginalHandler);

/**
 * GET /api/jobs/:id/result-url
 * Request: Query ?download=1 (optional)
 * Response: 200 { url: string, expiresAt: string }
 * Errors: 400 INVALID_UUID, 401 UNAUTHORIZED, 404 NOT_FOUND
 */
jobsRouter.get("/:id/result-url", requireAuth, validateId, getJobResultUrlHandler);

/**
 * GET /api/jobs/:id/original-url
 * Request: None
 * Response: 200 { url: string, expiresAt: string }
 * Errors: 400 INVALID_UUID, 401 UNAUTHORIZED, 404 NOT_FOUND
 */
jobsRouter.get("/:id/original-url", requireAuth, validateId, getJobOriginalUrlHandler);

/**
 * POST /api/jobs/:id/retry
 * Request: None
 * Response: 201 { job: JobResponseDTO }
 * Errors: 400 INVALID_UUID / NOT_FAILED, 404 NOT_FOUND, 503 SERVICE_UNAVAILABLE
 */
jobsRouter.post("/:id/retry", requireAuth, validateId, retryJobHandler);

/**
 * DELETE /api/jobs/:id
 * Request: None
 * Response: 204 No Content
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND, 409 JOB_ACTIVE
 */
jobsRouter.delete("/:id", requireAuth, validateId, deleteJobHandler);
