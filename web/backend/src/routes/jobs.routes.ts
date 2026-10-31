/**
 * Express router defining endpoints for individual image jobs, downloads, and retries.
 */
import { Router } from "express";
import { getJobHandler, getJobOriginalHandler, retryJobHandler } from "../controllers/jobs.controller";

export const jobsRouter = Router();

/**
 * GET /api/jobs/:id
 * Request: None
 * Response: 200 { job: JobResponseDTO }
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
jobsRouter.get("/:id", getJobHandler);

/**
 * GET /api/jobs/:id/original
 * Request: None
 * Response: 200 binary image stream with Content-Type and Content-Disposition headers
 * Errors: 400 INVALID_UUID, 404 NOT_FOUND
 */
jobsRouter.get("/:id/original", getJobOriginalHandler);

/**
 * POST /api/jobs/:id/retry
 * Request: None
 * Response: 201 { job: JobResponseDTO }
 * Errors: 400 INVALID_UUID / NOT_FAILED, 404 NOT_FOUND, 503 SERVICE_UNAVAILABLE
 */
jobsRouter.post("/:id/retry", retryJobHandler);
