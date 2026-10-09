import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { config } from "./config";
import { getJob, getStats, initializeDatabase, insertJob, listJobs, updateJobQueued } from "./db";
import { closeMessaging, connectMessaging, publishJob } from "./messaging";
import { ensureBuckets, storage, UPLOADS_BUCKET } from "./storage";
import { JOB_TYPES, JobType } from "./types";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_BYTES },
});
const app = express();
app.use(cors());
app.use(express.json());

function parseParams(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") throw new Error("params must be a JSON object");
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("params must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function outputExtension(type: JobType, params: Record<string, unknown>, originalName: string): string {
  if (type === "image-convert") {
    const target = String(params.targetFormat ?? "JPEG").toLowerCase();
    return target === "jpeg" ? "jpg" : target;
  }
  return path.extname(originalName).slice(1).toLowerCase() || "jpg";
}

function serializeJob(job: Awaited<ReturnType<typeof getJob>>) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    originalFilename: job.original_filename,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    resultUrl: job.result_url,
    resultSummary: job.result_summary,
    error: job.error,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

app.get("/health", (_request, response) => response.json({ status: "ok" }));

app.post("/api/jobs", upload.single("file"), async (request, response, next) => {
  try {
    if (!request.file) return response.status(400).json({ error: "A file is required" });
    const type = request.body.type as string;
    if (!JOB_TYPES.includes(type as JobType)) {
      return response.status(400).json({ error: `type must be one of: ${JOB_TYPES.join(", ")}` });
    }
    const params = parseParams(request.body.params);
    const jobId = randomUUID();
    const inputKey = `${jobId}/input${path.extname(request.file.originalname).toLowerCase() || ".bin"}`;
    const outputKey = `${jobId}/result.${outputExtension(type as JobType, params, request.file.originalname)}`;
    await storage.putObject(UPLOADS_BUCKET, inputKey, request.file.buffer, request.file.size, {
      "Content-Type": request.file.mimetype,
    });
    await insertJob({
      id: jobId,
      type,
      originalFilename: request.file.originalname,
      inputKey,
      outputKey,
    });
    try {
      await publishJob(type === "object-detection" ? "jobs.ai" : "jobs.image", {
        jobId,
        type,
        input: { bucket: UPLOADS_BUCKET, key: inputKey },
        output: { bucket: "results", key: outputKey },
        params,
      });
      await updateJobQueued(jobId);
    } catch (error) {
      console.error(`Failed to publish job ${jobId}`, error);
      return response.status(503).json({ error: "Job queue is unavailable", jobId });
    }
    return response.status(202).json({ job: serializeJob(await getJob(jobId)) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/jobs", async (_request, response, next) => {
  try {
    response.json({ jobs: (await listJobs()).map(serializeJob) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/jobs/:id", async (request, response, next) => {
  try {
    const job = await getJob(request.params.id);
    if (!job) return response.status(404).json({ error: "Job not found" });
    response.json({ job: serializeJob(job) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/stats", async (_request, response, next) => {
  try {
    response.json({ jobs: await getStats(), timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return response.status(413).json({ error: `File exceeds ${config.UPLOAD_MAX_BYTES} bytes` });
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return response.status(400).json({ error: message });
});

async function start(): Promise<void> {
  await initializeDatabase();
  await ensureBuckets();
  await connectMessaging();
  const server = app.listen(config.PORT, () => {
    console.log(`Web API listening on http://localhost:${config.PORT}`);
  });
  const shutdown = async () => {
    server.close();
    await closeMessaging();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("Web API failed to start", error);
  process.exitCode = 1;
});
