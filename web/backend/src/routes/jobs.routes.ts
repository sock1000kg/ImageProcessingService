/**
 * Express router defining endpoints for individual image jobs, downloads, and retries.
 */
import { Router } from "express";
import { getJobHandler, getJobOriginalHandler, retryJobHandler } from "../controllers/jobs.controller";
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
jobsRouter.get("/:id", validateId, requireAuth, getJobHandler);

/**
 * GET /api/jobs/:id/original
 * Request: None
 * Response: 200 binary image stream with Content-Type and Content-Disposition headers
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
jobsRouter.get("/:id/original", validateId, requireAuth, getJobOriginalHandler);

/**
 * POST /api/jobs/:id/retry
 * Request: None
 * Response: 201 { job: JobResponseDTO }
 * Errors: 400 INVALID_UUID / NOT_FAILED, 404 NOT_FOUND, 503 SERVICE_UNAVAILABLE
 */
jobsRouter.post("/:id/retry", validateId, requireAuth, retryJobHandler);
