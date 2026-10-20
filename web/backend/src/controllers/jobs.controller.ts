import { Request, Response, NextFunction } from "express";

import { getJob, listJobs } from "../db";
import { createJob, serializeJob } from "../services/job.service";

export async function createJobHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.file) {
      response.status(400).json({ error: "A file is required" });
      return;
    }
    const job = await createJob(request.file, request.body.type, request.body.params);
    response.status(202).json({ job: serializeJob(job) });
  } catch (error) {
    next(error);
  }
}

export async function listJobsHandler(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ jobs: (await listJobs()).map(serializeJob) });
  } catch (error) {
    next(error);
  }
}

export async function getJobHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    const job = await getJob(id);
    if (!job) {
      response.status(404).json({ error: "Job not found" });
      return;
    }
    response.json({ job: serializeJob(job) });
  } catch (error) {
    next(error);
  }
}
