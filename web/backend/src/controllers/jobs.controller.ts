import { NextFunction, Request, Response } from "express";
import { getJobById, getJobOriginalStream } from "../services/batch.service";

export async function getJobHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    const job = await getJobById(id);
    if (!job) {
      response.status(404).json({ error: "Job not found" });
      return;
    }
    response.json({ job });
  } catch (error) {
    next(error);
  }
}

export async function getJobOriginalHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    const streamInfo = await getJobOriginalStream(id);
    if (!streamInfo) {
      response.status(404).json({ error: "Job or original image not found" });
      return;
    }

    if (streamInfo.contentType) {
      response.setHeader("Content-Type", streamInfo.contentType);
    }
    if (streamInfo.contentLength !== undefined) {
      response.setHeader("Content-Length", streamInfo.contentLength);
    }

    streamInfo.stream.on("error", (error) => {
      next(error);
    });

    streamInfo.stream.pipe(response);
  } catch (error) {
    next(error);
  }
}
