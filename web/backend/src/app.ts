/**
 * Express application factory configuring middleware, routes, and SPA fallback.
 */
import cors from "cors";
import express, { Express } from "express";
import path from "node:path";
import { errorMiddleware, notFound } from "./errors";
import { batchesRouter } from "./routes/batches.routes";
import { jobsRouter } from "./routes/jobs.routes";
import { systemRouter } from "./routes/system.routes";

/**
 * Creates and configures the Express application with JSON parsing, API routes, and static frontend assets.
 */
export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use(systemRouter);
  app.use("/api/batches", batchesRouter);
  app.use("/api/jobs", jobsRouter);

  // Unknown /api/* routes -> 404 NOT_FOUND ErrorDTO
  app.all("/api/*", (_req, _res, next) => {
    next(notFound("Not found", "NOT_FOUND"));
  });

  const frontendPath = path.resolve(process.cwd(), "frontend", "dist");
  app.use(express.static(frontendPath));
  app.get("*", (_req, res, next) => {
    res.sendFile(path.join(frontendPath, "index.html"), (error) => {
      if (error) next(error);
    });
  });

  app.use(errorMiddleware);

  return app;
}
