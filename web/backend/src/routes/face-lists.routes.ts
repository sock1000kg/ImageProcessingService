/**
 * Express router defining endpoints for saved biometric face reference lists.
 */
import { Router } from "express";
import multer from "multer";
import { config } from "../config";
import { requireAuth } from "../middleware/auth.middleware";
import { RATE_LIMIT_BASES, rateLimit, userKey } from "../middleware/rate-limit.middleware";
import {
  addFacesToListHandler,
  createFaceListHandler,
  deleteFaceFromListHandler,
  deleteFaceListHandler,
  getFaceStreamHandler,
  getFaceUrlHandler,
  listFaceListsHandler,
  renameFaceListHandler,
} from "../controllers/face-lists.controller";

/**
 * Multer multipart upload parser for face list images.
 *
 * Why defParamCharset utf8: Multer defaults to latin1, which garbles non-ASCII filenames (e.g. Vietnamese).
 * Setting defParamCharset to utf8 ensures original filenames with diacritics decode correctly.
 */
export const faceListsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_BYTES },
  defParamCharset: "utf8",
});

export const faceListsRouter = Router();

export const createListLimit = rateLimit(RATE_LIMIT_BASES.createFaceList, userKey);

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
faceListsRouter.post("/", requireAuth, createListLimit, faceListsUpload.array("faces", 10), createFaceListHandler);

/**
 * POST /api/face-lists/:id/faces
 * Request: Params id (UUID), multipart/form-data with 1..5 faces files
 * Response: 200 { list: FaceListItemDTO }
 * Errors: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 404 NOT_FOUND, 409 FACE_LIST_FULL, 413 FILE_TOO_LARGE, 429 RATE_LIMITED
 */
faceListsRouter.post(
  "/:id/faces",
  requireAuth,
  createListLimit,
  faceListsUpload.array("faces", 10),
  addFacesToListHandler,
);

/**
 * GET /api/face-lists/:id/faces/:faceId
 * Request: Params id (UUID) and faceId (unique face identifier within list)
 * Response: 200 image stream with Cache-Control: private, no-store
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.get("/:id/faces/:faceId", requireAuth, getFaceStreamHandler);

/**
 * GET /api/face-lists/:id/faces/:faceId/url
 * Request: Params id (UUID) and faceId (unique face identifier within list)
 * Response: 200 { url: string, expiresAt: string }
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.get("/:id/faces/:faceId/url", requireAuth, getFaceUrlHandler);

/**
 * DELETE /api/face-lists/:id/faces/:faceId
 * Request: Params id (UUID) and faceId (unique face identifier within list)
 * Response: 200 { list: FaceListItemDTO | null }
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.delete("/:id/faces/:faceId", requireAuth, deleteFaceFromListHandler);

/**
 * PATCH /api/face-lists/:id
 * Request: Params id (UUID), JSON body { name: string } (1-100 chars)
 * Response: 200 { list: FaceListItemDTO }
 * Errors: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.patch("/:id", requireAuth, renameFaceListHandler);

/**
 * DELETE /api/face-lists/:id
 * Request: Params id (UUID)
 * Response: 204 No Content
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.delete("/:id", requireAuth, deleteFaceListHandler);
