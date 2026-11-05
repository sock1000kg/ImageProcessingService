/**
 * HTTP request controllers managing saved face lists, biometric reference storage, and thumbnails.
 */
import { NextFunction, Request, Response } from "express";
import { createFaceList, deleteFaceList, getFaceStream, listFaceLists } from "../services/face-list.service";
import { notFound } from "../errors";
import { UUID_REGEX } from "../dto";

function parseListId(idParam: unknown): string {
  if (typeof idParam !== "string" || !UUID_REGEX.test(idParam)) {
    throw notFound("Face list not found");
  }
  return idParam;
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
 * GET /api/face-lists/:id/faces/:n
 * Streams an individual face thumbnail with no-store cache directives to protect biometric data.
 *
 * Why private, no-store: Biometric reference imagery is sensitive personal data that should
 * never be cached by browsers or shared intermediate proxy caches.
 */
export async function getFaceStreamHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseListId(request.params.id);
    const rawN = Array.isArray(request.params.n) ? request.params.n[0] : request.params.n;
    const n = typeof rawN === "string" ? parseInt(rawN, 10) : NaN;
    if (Number.isNaN(n) || n < 1) {
      throw notFound("Face reference not found");
    }

    const userId = request.authUser!.id;
    const streamInfo = await getFaceStream(id, n, userId);

    response.setHeader("Cache-Control", "private, no-store");
    if (streamInfo.contentType) {
      response.setHeader("Content-Type", streamInfo.contentType);
    }
    if (streamInfo.contentLength !== undefined) {
      response.setHeader("Content-Length", streamInfo.contentLength);
    }

    streamInfo.stream.on("error", (error) => {
      next(error);
    });

    streamInfo.stream.pipe(response);
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
