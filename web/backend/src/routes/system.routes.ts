/**
 * System and operational routes for liveness, readiness, and metrics.
 */
import { Router } from "express";
import { getHealthHandler, getReadyHandler, getSystemStatsHandler } from "../controllers/system.controller";

export const systemRouter = Router();

/**
 * GET /health
 * Request: None
 * Response: 200 { status: "ok" }
 * Errors: None
 */
systemRouter.get("/health", getHealthHandler);

/**
 * GET /ready
 * Request: None
 * Response: 200 { status: "ready" }
 * Errors: 503 SERVICE_UNAVAILABLE if PostgreSQL, NATS, or S3 storage check fails
 */
systemRouter.get("/ready", getReadyHandler);

/**
 * GET /api/system/stats
 * Request: None
 * Response: 200 { jobs: Record<JobStatus, number> }
 * Errors: 500 INTERNAL_SERVER_ERROR if database query fails
 */
systemRouter.get("/api/system/stats", getSystemStatsHandler);
