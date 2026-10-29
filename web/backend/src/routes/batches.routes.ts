import { Router } from "express";
import multer from "multer";
import { config } from "../config";
import {
  createBatchHandler,
  deleteBatchHandler,
  getBatchHandler,
  getBatchReportHandler,
} from "../controllers/batches.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_BYTES },
});

export const batchesRouter = Router();

batchesRouter.post(
  "/",
  upload.fields([
    { name: "files", maxCount: config.BATCH_MAX_FILES },
    { name: "whitelist", maxCount: 5 },
  ]),
  createBatchHandler,
);
batchesRouter.get("/:id", getBatchHandler);
batchesRouter.get("/:id/report", getBatchReportHandler);
batchesRouter.delete("/:id", deleteBatchHandler);
