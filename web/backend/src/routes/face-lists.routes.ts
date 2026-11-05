/**
 * Express router defining endpoints for saved biometric face reference lists.
 */
import { Router } from "express";
import multer from "multer";
import { config } from "../config";
import { requireAuth } from "../middleware/auth.middleware";
import { rateLimit, userKey } from "../middleware/rate-limit.middleware";
import {
  createFaceListHandler,
  deleteFaceListHandler,
  getFaceStreamHandler,
  listFaceListsHandler,
} from "../controllers/face-lists.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_BYTES },
});

export const faceListsRouter = Router();

const createListLimit = rateLimit(60_000, config.RATE_LIMIT_BATCHES_PER_MINUTE, userKey);

/**
 * GET /api/face-lists
 * Request: None
 * Response: 200 { lists: FaceListItemDTO[] }
 * Errors: 401 UNAUTHORIZED
 */
faceListsRouter.get("/", requireAuth, listFaceListsHandler);

/**
 * POST /api/face-lists
 * Request: multipart/form-data with name (1-100 chars) and 1..5 faces files
 * Response: 201 { list: FaceListItemDTO }
 * Errors: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 413 FILE_TOO_LARGE, 429 RATE_LIMITED
 */
faceListsRouter.post("/", requireAuth, createListLimit, upload.array("faces", 10), createFaceListHandler);

/**
 * GET /api/face-lists/:id/faces/:n
 * Request: Params id (UUID) and n (1-based face index)
 * Response: 200 image stream with Cache-Control: private, no-store
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.get("/:id/faces/:n", requireAuth, getFaceStreamHandler);

/**
 * DELETE /api/face-lists/:id
 * Request: Params id (UUID)
 * Response: 204 No Content
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.delete("/:id", requireAuth, deleteFaceListHandler);
