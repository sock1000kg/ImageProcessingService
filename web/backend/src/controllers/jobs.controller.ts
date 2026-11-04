/**
 * HTTP request controllers for single-job inspection, stream downloads, and retries.
 */
import { NextFunction, Request, Response } from "express";
import { deleteJobById, getJobById, getJobOriginalStream, retryFailedJob } from "../services/batch.service";
import { notFound } from "../errors";
import { validateIdParam } from "../dto";

export async function getJobHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const job = await getJobById(id, request.authUser?.id);
    if (!job) {
      throw notFound("Job not found");
    }
    response.json({ job });
  } catch (error) {
    next(error);
  }
}

export async function getJobOriginalHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const streamInfo = await getJobOriginalStream(id, request.authUser?.id);
    if (!streamInfo) {
      throw notFound("Job or original image not found");
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

export async function retryJobHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const job = await retryFailedJob(id, request.authUser?.id);
    response.status(202).json({ job });
  } catch (error) {
    next(error);
  }
}

export async function deleteJobHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const userId = request.authUser!.id;
    await deleteJobById(id, userId);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}
