/**
 * Service managing user-saved biometric face reference lists and thumbnail streaming.
 *
 * Biometric data retention policy: Face lists store biometric reference keys that users explicitly opt
 * to persist. Unlike temporary batch whitelist files which are purged when jobs finish, saved face lists
 * remain until the user explicitly requests their deletion. Deletion removes the storage objects immediately.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { storage, UPLOADS_BUCKET } from "../storage";
import { notFound } from "../errors";
import { FaceListItemDTO, FaceListsResponseDTO, parseFaceListName, validateFaceListFiles } from "../dto";
import {
  createFaceList as createFaceListRepo,
  deleteFaceListRow,
  getFaceListOwnedByUser,
  listFaceListsByUserId,
} from "../repositories/face-list.repository";

/**
 * Creates a new saved face reference list, uploading images into the user's isolated MinIO path.
 *
 * Why isolated paths: Storing under `lists/<userId>/<listId>/face-<n>.<ext>` ensures tenant isolation
 * and prevents accidental leakage into public result namespaces.
 * Why rollback cleanup: If any file fails to upload or database persistence fails, all uploaded
 * objects under the list's prefix are immediately purged so no orphan biometric data lingers.
 */
export async function createFaceList(
  userId: string,
  rawName: unknown,
  files: Express.Multer.File[],
): Promise<FaceListItemDTO> {
  const name = parseFaceListName(rawName);
  validateFaceListFiles(files);

  const listId = randomUUID();
  const keys: string[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const key = `lists/${userId}/${listId}/face-${i + 1}${ext}`;
      await storage.putObject(UPLOADS_BUCKET, key, file.buffer, file.mimetype);
      keys.push(key);
    }

    const created = await createFaceListRepo({
      id: listId,
      userId,
      name,
      keys,
    });

    return {
      id: created.id,
      name: created.name,
      faceCount: created.keys.length,
      createdAt: created.createdAt.toISOString(),
    };
  } catch (error) {
    if (keys.length > 0) {
      try {
        await storage.deletePrefix(UPLOADS_BUCKET, `lists/${userId}/${listId}/`);
      } catch (cleanErr) {
        console.error("Failed to clean up face list objects after failure", cleanErr);
      }
    }
    throw error;
  }
}

/**
 * Lists all saved face lists owned by the current user.
 */
export async function listFaceLists(userId: string): Promise<FaceListsResponseDTO> {
  const lists = await listFaceListsByUserId(userId);
  return {
    lists: lists.map((item) => ({
      id: item.id,
      name: item.name,
      faceCount: item.keys.length,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

/**
 * Retrieves an image stream for a specific face index within a user's face list.
 *
 * Why owner verification: Ensures only the authenticated owner can retrieve their own reference photos.
 * Other users receive a 404 response to avoid information disclosure.
 */
export async function getFaceStream(
  id: string,
  faceIndex: number,
  userId: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType?: string; contentLength?: number }> {
  const list = await getFaceListOwnedByUser(id, userId);
  if (!list) {
    throw notFound("Face list not found");
  }

  if (faceIndex < 1 || faceIndex > list.keys.length) {
    throw notFound("Face reference not found");
  }

  const key = list.keys[faceIndex - 1]!;
  const streamInfo = await storage.getObjectStream(UPLOADS_BUCKET, key);
  if (!streamInfo) {
    throw notFound("Face reference image not found");
  }

  return streamInfo;
}

/**
 * Deletes a face list and permanently purges all its reference images from MinIO storage.
 *
 * Why immediate MinIO deletion: Biometric reference data must not linger on disk when the user
 * requests deletion. Storage prefix `lists/<userId>/<id>/` is purged completely before removing
 * the database row.
 */
export async function deleteFaceList(id: string, userId: string): Promise<void> {
  const list = await getFaceListOwnedByUser(id, userId);
  if (!list) {
    throw notFound("Face list not found");
  }

  // Do not catch storage deletion errors: if MinIO fails, propagate the error so the database row
  // is preserved, allowing the user to retry deletion without leaving orphaned biometric objects in storage.
  await storage.deletePrefix(UPLOADS_BUCKET, `lists/${userId}/${id}/`);
  await deleteFaceListRow(id, userId);
}
