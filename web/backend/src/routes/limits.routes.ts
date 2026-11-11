import { Router } from "express";
import { config } from "../config";

export const limitsRouter = Router();

/**
 * GET /api/limits
 * Response: 200 { imageUploadMaxBytes (photos), videoUploadMaxBytes, batchMaxFiles }
 * Why: the limits are set per deployment (env), so the UI asks instead of hard-coding them and can show the real
 * value in its hint and in the message for a file that is too big.
 */
limitsRouter.get("/", (_request, response) => {
  response.json({
    imageUploadMaxBytes: config.IMAGE_UPLOAD_MAX_BYTES,
    videoUploadMaxBytes: config.VIDEO_UPLOAD_MAX_BYTES,
    batchMaxFiles: config.BATCH_MAX_FILES,
  });
});
