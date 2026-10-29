import { NextFunction, Request, Response } from "express";
import {
  createBatch,
  deleteBatchById,
  getBatchById,
  getBatchReportById,
} from "../services/batch.service";

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
      response.status(404).json({ error: "Batch not found" });
      return;
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
      response.status(404).json({ error: "Batch not found" });
      return;
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
      response.status(404).json({ error: "Batch not found" });
      return;
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}
