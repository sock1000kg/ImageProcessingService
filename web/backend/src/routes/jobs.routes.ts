import { Router } from "express";
import multer from "multer";

import { config } from "../config";
import { createJobHandler, getJobHandler, listJobsHandler } from "../controllers/jobs.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_BYTES },
});

export const jobsRouter = Router();
jobsRouter.post("/", upload.single("file"), createJobHandler);
jobsRouter.get("/", listJobsHandler);
jobsRouter.get("/:id", getJobHandler);
