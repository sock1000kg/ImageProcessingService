/**
 * HTTP request controllers managing saved face lists, biometric reference storage, and thumbnails.
 */
import { NextFunction, Request, Response } from "express";
import {
  addFacesToList,
  createFaceList,
  deleteFaceFromList,
  deleteFaceList,
  getFacePresignedUrl,
  listFaceLists,
  renameFaceList,
} from "../services/face-list.service";
import { notFound } from "../errors";
import { UUID_REGEX } from "../dto";

function parseListId(idParam: unknown): string {
  if (typeof idParam !== "string" || !UUID_REGEX.test(idParam)) {
    throw notFound("Face list not found");
  }
  return idParam;
}

/**
 * Validates that faceId is a non-empty string.
 *
 * Why: Ensures only valid string identifiers are looked up against list keys,
 * throwing 404 notFound if empty or invalid.
 */
function parseFaceId(faceIdParam: unknown): string {
  const rawId = Array.isArray(faceIdParam) ? faceIdParam[0] : faceIdParam;
  if (typeof rawId !== "string" || rawId.trim().length === 0) {
    throw notFound("Face reference not found");
  }
  return rawId.trim();
}

/**
 * GET /api/face-lists
 * Lists saved face reference lists owned by the authenticated user.
 */
export async function listFaceListsHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const userId = request.authUser!.id;
    const result = await listFaceLists(userId);
    response.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/face-lists
 * Creates a new saved face list with 1-5 reference images.
 */
export async function createFaceListHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const userId = request.authUser!.id;
    const files = (request.files as Express.Multer.File[]) ?? [];
    const list = await createFaceList(userId, request.body?.name, files);
    response.status(201).json({ list });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/face-lists/:id/faces
 * Appends new biometric reference photos to an existing saved face list.
 *
 * Why atomic append: Ensures concurrent requests cannot exceed the face list cap
 * or leave orphaned storage objects behind on failure.
 */
export async function addFacesToListHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseListId(request.params.id);
    const userId = request.authUser!.id;
    const files = (request.files as Express.Multer.File[]) ?? [];
    const list = await addFacesToList(id, userId, files);
    response.status(200).json({ list });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/face-lists/:id/faces/:faceId/url
 * Returns a presigned GET URL for a biometric face photo with private no-store headers.
 */
export async function getFaceUrlHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseListId(request.params.id);
    const faceId = parseFaceId(request.params.faceId);

    const userId = request.authUser!.id;
    const result = await getFacePresignedUrl(id, faceId, userId);

    response.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/face-lists/:id/faces/:faceId
 * Deletes a single biometric face from a saved face list.
 *
 * Why return { list }: Allows the frontend to update its local state and faceCount atomically.
 * Returns { list: null } if the last face was deleted, mirroring batch deletion when the last job is removed.
 */
export async function deleteFaceFromListHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseListId(request.params.id);
    const faceId = parseFaceId(request.params.faceId);
    const userId = request.authUser!.id;
    const result = await deleteFaceFromList(id, faceId, userId);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/face-lists/:id
 * Permanently deletes a saved face list and purges its biometric files from MinIO.
 */
export async function deleteFaceListHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseListId(request.params.id);
    const userId = request.authUser!.id;
    await deleteFaceList(id, userId);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/face-lists/:id
 * Renames a saved face list owned by the authenticated user.
 */
export async function renameFaceListHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseListId(request.params.id);
    const userId = request.authUser!.id;
    const list = await renameFaceList(id, request.body?.name, userId);
    response.status(200).json({ list });
  } catch (error) {
    next(error);
  }
}
