import { NextFunction, Request, Response } from "express";
import {
  createBatch,
  deleteBatchById,
  getBatchById,
  getBatchReportById,
} from "../services/batch.service";
import { notFound } from "../errors";

export async function createBatchHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filesMap = request.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const files = filesMap?.files ?? [];
    const whitelist = filesMap?.whitelist ?? [];

    const batch = await createBatch({
      files,
      whitelist,
      rawConfig: request.body.config,
    });

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
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
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
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
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
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    const deleted = await deleteBatchById(id);
    if (!deleted) {
      throw notFound("Batch not found");
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}
