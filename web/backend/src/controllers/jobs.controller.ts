/**
 * HTTP request controllers for single-job inspection, stream downloads, and retries.
 */
import { NextFunction, Request, Response } from "express";
import { deleteJobById, editJob, getJobById, retryFailedJob } from "../services/job.service";
import { getJobOriginalPresignedUrl, getJobResultPresignedUrl } from "../services/presign.service";
import { notFound } from "../errors";
import { editJobBodySchema, validateIdParam } from "../dto";

export async function getJobHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const job = await getJobById(id, request.authUser!.id);
    if (!job) {
      throw notFound("Job not found");
    }
    response.json({ job });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/jobs/:id/result-url
 * Returns a presigned GET URL for the completed job's result image.
 *
 * Why query download: Setting ?download=1 signs an RFC attachment header on the S3 response,
 * directing the browser to download rather than display inline.
 */
export async function getJobResultUrlHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const userId = request.authUser!.id;
    const download = request.query.download === "1";
    const result = await getJobResultPresignedUrl(id, userId, { download });
    response.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/jobs/:id/original-url
 * Returns a presigned GET URL for the job's unredacted original image with private no-store headers.
 */
export async function getJobOriginalUrlHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const userId = request.authUser!.id;
    const result = await getJobOriginalPresignedUrl(id, userId);
    response.json(result);
  } catch (error) {
    next(error);
  }
}

export async function retryJobHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const acceptMissingFaces = Boolean(request.body?.acceptMissingFaces);
    const job = await retryFailedJob(id, request.authUser!.id, { acceptMissingFaces });
    response.status(202).json({ job });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/jobs/:id/edit
 * Re-renders a completed image job with updated bounding boxes and redaction options.
 */
export async function editJobHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const body = editJobBodySchema.parse(request.body);
    const job = await editJob(id, request.authUser!.id, body);
    response.status(201).json({ job });
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
