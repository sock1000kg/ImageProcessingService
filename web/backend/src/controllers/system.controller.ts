/**
 * HTTP request controllers for service telemetry, health, and readiness probes.
 */
import { NextFunction, Request, Response } from "express";
import { getStats } from "../repositories/job.repository";
import { isMessagingReady } from "../messaging";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../storage";

export function getHealthHandler(_req: Request, res: Response): void {
  res.json({ status: "ok" });
}

export async function getReadyHandler(_req: Request, res: Response): Promise<void> {
  try {
    await getStats();
    if (
      !isMessagingReady() ||
      !(await storage.bucketExists(UPLOADS_BUCKET)) ||
      !(await storage.bucketExists(RESULTS_BUCKET))
    ) {
      res.status(503).json({ status: "not_ready" });
      return;
    }
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
}

export async function getSystemStatsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await getStats();
    res.json({ jobs: stats, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}
