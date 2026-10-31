import { NextFunction, Request, Response } from "express";
import {
  addBatchFile,
  createDraftBatch,
  deleteBatchById,
  getBatchById,
  getBatchReportById,
  startBatch,
} from "../services/batch.service";
import { notFound } from "../errors";
import { validateIdParam } from "../dto";

export async function createBatchHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filesMap = request.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const files = filesMap?.files ?? [];
    const whitelist = filesMap?.whitelist ?? [];
    const filesPresent = files.length > 0 || request.body?.files !== undefined;

    const batch = await createDraftBatch({
      whitelist,
      rawConfig: request.body.config,
      filesPresent,
    });

    response.status(201).json({ batch });
  } catch (error) {
    next(error);
  }
}

export async function addBatchFileHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const job = await addBatchFile(id, request.file);
    response.status(201).json({ job });
  } catch (error) {
    next(error);
  }
}

export async function startBatchHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const batch = await startBatch(id);
    response.status(202).json({ batch });
  } catch (error) {
    next(error);
  }
}

export async function getBatchHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const batch = await getBatchById(id);
    if (!batch) {
      throw notFound("Batch not found");
    }
    response.json({ batch });
  } catch (error) {
    next(error);
  }
}

export async function getBatchReportHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const report = await getBatchReportById(id);
    if (!report) {
      throw notFound("Batch not found");
    }
    response.json({ report });
  } catch (error) {
    next(error);
  }
}

export async function deleteBatchHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const deleted = await deleteBatchById(id);
    if (!deleted) {
      throw notFound("Batch not found");
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}
