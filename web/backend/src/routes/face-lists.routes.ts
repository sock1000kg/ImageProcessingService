/**
 * Express router defining endpoints for saved biometric face reference lists.
 */
import { Router } from "express";
import multer from "multer";
import { config } from "../config";
import { MAX_FACE_LIST_FILES } from "../dto";
import { requireAuth } from "../middleware/auth.middleware";
import { RATE_LIMIT_BASES, rateLimit, userKey } from "../middleware/rate-limit.middleware";
import { validateId } from "../middleware/validate-id.middleware";
import {
  addFacesToListHandler,
  createFaceListHandler,
  deleteFaceFromListHandler,
  deleteFaceListHandler,
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
  limits: { fileSize: config.IMAGE_UPLOAD_MAX_BYTES },
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
faceListsRouter.post(
  "/",
  requireAuth,
  createListLimit,
  faceListsUpload.array("faces", MAX_FACE_LIST_FILES),
  createFaceListHandler,
);

/**
 * POST /api/face-lists/:id/faces
 * Request: Params id (UUID), multipart/form-data with 1..5 faces files
 * Response: 200 { list: FaceListItemDTO }
 * Errors: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 404 NOT_FOUND, 409 FACE_LIST_FULL, 413 FILE_TOO_LARGE, 429 RATE_LIMITED
 */
faceListsRouter.post(
  "/:id/faces",
  requireAuth,
  validateId("Allow list"),
  createListLimit,
  faceListsUpload.array("faces", MAX_FACE_LIST_FILES),
  addFacesToListHandler,
);

/**
 * GET /api/face-lists/:id/faces/:faceId/url
 * Request: Params id (UUID) and faceId (unique face identifier within list)
 * Response: 200 { url: string, expiresAt: string }
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.get("/:id/faces/:faceId/url", requireAuth, validateId("Allow list"), getFaceUrlHandler);

/**
 * DELETE /api/face-lists/:id/faces/:faceId
 * Request: Params id (UUID) and faceId (unique face identifier within list)
 * Response: 200 { list: FaceListItemDTO | null }
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.delete("/:id/faces/:faceId", requireAuth, validateId("Allow list"), deleteFaceFromListHandler);

/**
 * PATCH /api/face-lists/:id
 * Request: Params id (UUID), JSON body { name: string } (1-100 chars)
 * Response: 200 { list: FaceListItemDTO }
 * Errors: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.patch("/:id", requireAuth, validateId("Allow list"), renameFaceListHandler);

/**
 * DELETE /api/face-lists/:id
 * Request: Params id (UUID)
 * Response: 204 No Content
 * Errors: 401 UNAUTHORIZED, 404 NOT_FOUND
 */
faceListsRouter.delete("/:id", requireAuth, validateId("Allow list"), deleteFaceListHandler);
