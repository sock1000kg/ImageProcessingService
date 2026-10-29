import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import path from "node:path";
import multer from "multer";

import { config } from "./config";
import { getStats } from "./db";
import { isMessagingReady } from "./messaging";
import { batchesRouter } from "./routes/batches.routes";
import { jobsRouter } from "./routes/jobs.routes";
import { storage, RESULTS_BUCKET, UPLOADS_BUCKET } from "./storage";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.get("/ready", async (_request, response) => {
    try {
      await getStats();
      if (
        !isMessagingReady() ||
        !(await storage.bucketExists(UPLOADS_BUCKET)) ||
        !(await storage.bucketExists(RESULTS_BUCKET))
      ) {
        response.status(503).json({ status: "not_ready" });
        return;
      }
      response.json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "not_ready" });
    }
  });

  app.use("/api/batches", batchesRouter);
  app.use("/api/jobs", jobsRouter);

  app.get("/api/system/stats", async (_request, response, next) => {
    try {
      response.json({ jobs: await getStats(), timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  const frontendPath = path.resolve(process.cwd(), "frontend", "dist");
  app.use(express.static(frontendPath));
  app.get("*", (_request, response, next) => {
    if (_request.path.startsWith("/api/")) {
      next();
      return;
    }
    response.sendFile(path.join(frontendPath, "index.html"), (error) => {
      if (error) next(error);
    });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        response.status(413).json({ error: `File exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes` });
        return;
      }
      response.status(400).json({ error: error.message });
      return;
    }

    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 400;

    response.status(statusCode >= 400 && statusCode < 600 ? statusCode : 400).json({
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  });

  return app;
}
