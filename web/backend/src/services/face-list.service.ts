/**
 * Service managing user-saved biometric face reference lists and thumbnail streaming.
 *
 * Biometric data retention policy: Face lists store biometric reference keys that users explicitly opt
 * to persist. Unlike temporary batch whitelist files which are purged when jobs finish, saved face lists
 * remain until the user explicitly requests their deletion. Deletion removes the storage objects immediately.
 */
import { assertImageContents } from "../media-types";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config";
import { storage, UPLOADS_BUCKET } from "../storage";
import { conflict, notFound } from "../errors";
import { FaceList } from "../generated/prisma/client";
import {
  CONTROL_CHAR_REGEX,
  FaceListItemDTO,
  FaceListsResponseDTO,
  MAX_FACE_LIST_FILES,
  parseFaceListName,
  validateFaceListFiles,
} from "../dto";
import {
  appendFaceListKeys,
  createFaceList as createFaceListRepo,
  deleteFaceListRow,
  getFaceListOwnedByUser,
  listFaceListsByUserId,
  removeFaceListKey,
  updateFaceListName,
} from "../repositories/face-list.repository";

/**
 * Sanitizes an uploaded face file originalname for storage and display.
 *
 * Why: Removes path segments (traversal prevention and cross-platform consistency),
 * strips control characters that could break terminal logs or HTTP headers, and caps at 255 chars.
 * Returns null if the sanitized name is empty so no map entry is saved.
 */
export function sanitizeFaceFileName(rawName?: string): string | null {
  if (!rawName) return null;
  const base = path.basename(rawName.replace(/\\/g, "/"));
  const cleaned = base.replace(new RegExp(CONTROL_CHAR_REGEX.source, "g"), "");
  if (!cleaned) return null;
  const truncated = cleaned.slice(0, 255);
  return truncated.length > 0 ? truncated : null;
}

/**
 * Extracts a key-to-name lookup map from a FaceList's raw faceNames Json field.
 */
export function parseFaceNamesMap(raw: unknown): Record<string, string> {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      return {};
    }
  } else if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, string>;
  }
  return {};
}

/**
 * Derives a stable face ID from its storage key by extracting the file name without extension.
 *
 * Why: Storage keys are shaped as `lists/<userId>/<listId>/<fileName>.<ext>` where fileName is unique
 * within the list (e.g. `face-1`, `face-<uuid>`). Using the file name without extension as the face ID
 * provides a stable, URL-safe identifier that does not shift when other faces are deleted.
 */
export function faceIdFromKey(key: string): string {
  const base = path.basename(key);
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

/**
 * Converts a database FaceList record into a FaceListItemDTO.
 *
 * Why centralized mapping: Consolidates the four DTO projections in face-list.service into a single function,
 * ensuring the faceNames array is strictly aligned with the keys order while preventing internal storage keys
 * from leaking into API responses.
 */
export function toFaceListItemDTO(list: FaceList): FaceListItemDTO {
  const nameMap = parseFaceNamesMap(list.faceNames);
  const keys = list.keys ?? [];
  const faceNames = keys.map((key) => {
    const val = nameMap[key];
    return typeof val === "string" && val.length > 0 ? val : null;
  });
  const faceIds = keys.map(faceIdFromKey);

  return {
    id: list.id,
    name: list.name,
    faceCount: keys.length,
    faceNames,
    faceIds,
    createdAt: list.createdAt instanceof Date ? list.createdAt.toISOString() : String(list.createdAt),
  };
}

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
  await assertImageContents(files, "Face file");

  const listId = randomUUID();
  const keys: string[] = [];
  const faceNames: Record<string, string> = {};

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const key = `lists/${userId}/${listId}/face-${i + 1}${ext}`;
      await storage.putObject(UPLOADS_BUCKET, key, file.buffer, file.mimetype);
      keys.push(key);
      const displayName = sanitizeFaceFileName(file.originalname);
      if (displayName) {
        faceNames[key] = displayName;
      }
    }

    const created = await createFaceListRepo({
      id: listId,
      userId,
      name,
      keys,
      faceNames,
    });

    return toFaceListItemDTO(created);
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
    lists: lists.map((item) => toFaceListItemDTO(item)),
  };
}

/**
 * Generates a presigned GET URL for a specific face in a user's allow list.
 *
 * Why owner verification: Ensures only the authenticated owner can access their saved reference photos.
 * Other users receive a 404 response to avoid information disclosure.
 * Why key matching: Matches faceId against list.keys to prevent reading arbitrary storage objects.
 * Why private, no-store: Instructs intermediate proxies and browsers never to cache biometric photos.
 */
export async function getFacePresignedUrl(
  id: string,
  faceId: string,
  userId: string,
): Promise<{ url: string; expiresAt: string }> {
  const list = await getFaceListOwnedByUser(id, userId);
  if (!list) {
    throw notFound("Allow list not found");
  }

  const key = list.keys.find((k) => faceIdFromKey(k) === faceId);
  if (!key) {
    throw notFound("Face reference not found");
  }

  return storage.presignGetUrl(UPLOADS_BUCKET, key, {
    ttlSeconds: config.PRESIGN_PRIVATE_TTL_SECONDS,
    cacheControl: "private, no-store",
  });
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
    throw notFound("Allow list not found");
  }

  // Do not catch storage deletion errors: if MinIO fails, propagate the error so the database row
  // is preserved, allowing the user to retry deletion without leaving orphaned biometric objects in storage.
  await storage.deletePrefix(UPLOADS_BUCKET, `lists/${userId}/${id}/`);
  await deleteFaceListRow(id, userId);
}

/**
 * Purges a list of specific storage keys, ignoring individual deletion errors.
 * Used during rollback to ensure only this request's uploaded objects are cleaned up.
 */
async function cleanupUploadedKeys(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await storage.deleteObject(UPLOADS_BUCKET, key);
    } catch (cleanErr) {
      console.error("Failed to clean up uploaded face list object", cleanErr);
    }
  }
}

/**
 * Appends new reference photos to an existing saved face list.
 *
 * Why atomic SQL append: Prevents race conditions from multi-tab or concurrent additions
 * and strictly bounds total faces to MAX_FACE_LIST_FILES at the database layer.
 * Why selective cleanup: Deletes only the objects uploaded during this request if the operation fails,
 * preserving existing reference faces.
 */
export async function addFacesToList(
  id: string,
  userId: string,
  files: Express.Multer.File[],
): Promise<FaceListItemDTO> {
  const existing = await getFaceListOwnedByUser(id, userId);
  if (!existing) {
    throw notFound("Allow list not found");
  }

  validateFaceListFiles(files);
  await assertImageContents(files, "Face file");

  if (existing.keys.length + files.length > MAX_FACE_LIST_FILES) {
    throw conflict(`Allow list cannot exceed ${MAX_FACE_LIST_FILES} faces`, "FACE_LIST_FULL");
  }

  const uploadedKeys: string[] = [];
  const uploadedNames: Record<string, string> = {};
  try {
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const key = `lists/${userId}/${id}/face-${randomUUID()}${ext}`;
      await storage.putObject(UPLOADS_BUCKET, key, file.buffer, file.mimetype);
      uploadedKeys.push(key);
      const displayName = sanitizeFaceFileName(file.originalname);
      if (displayName) {
        uploadedNames[key] = displayName;
      }
    }

    const updated = await appendFaceListKeys(id, userId, uploadedKeys, uploadedNames, MAX_FACE_LIST_FILES);
    if (!updated) {
      await cleanupUploadedKeys(uploadedKeys);
      uploadedKeys.length = 0;

      const current = await getFaceListOwnedByUser(id, userId);
      if (!current) {
        throw notFound("Allow list not found");
      }
      throw conflict(`Allow list cannot exceed ${MAX_FACE_LIST_FILES} faces`, "FACE_LIST_FULL");
    }

    return toFaceListItemDTO(updated);
  } catch (error) {
    if (uploadedKeys.length > 0) {
      await cleanupUploadedKeys(uploadedKeys);
    }
    throw error;
  }
}

/**
 * Deletes a single biometric face by stable face ID from a saved face list.
 *
 * Why object deletion first: Removes the biometric storage object before altering the database row.
 * If MinIO deletion fails, the error propagates without catching so the database row remains intact,
 * allowing the user to retry without leaving orphaned biometric objects (S3 deletes are idempotent).
 * Why ID-based key matching: Prevents position-shift race conditions from multiple tabs or repeated requests
 * by identifying the target photo by its stable storage key file name.
 * Why null when last face: When the list's only face is deleted, purges the entire list record and prefix,
 * returning { list: null } identical to deleting a batch's final job.
 */
export async function deleteFaceFromList(
  id: string,
  faceId: string,
  userId: string,
): Promise<{ list: FaceListItemDTO | null }> {
  const list = await getFaceListOwnedByUser(id, userId);
  if (!list) {
    throw notFound("Allow list not found");
  }

  const key = list.keys.find((k) => faceIdFromKey(k) === faceId);
  if (!key) {
    throw notFound("Face reference not found");
  }

  if (list.keys.length === 1) {
    await deleteFaceList(id, userId);
    return { list: null };
  }

  // Delete storage object first without catching errors
  await storage.deleteObject(UPLOADS_BUCKET, key);

  const updated = await removeFaceListKey(id, userId, key);
  if (!updated) {
    throw notFound("Allow list not found");
  }

  return {
    list: toFaceListItemDTO(updated),
  };
}

/**
 * Renames an existing saved face reference list owned by the authenticated user.
 *
 * Why owner-scoped: Prevents users from modifying lists owned by other accounts.
 * Leaves keys and faceNames untouched.
 */
export async function renameFaceList(id: string, rawName: unknown, userId: string): Promise<FaceListItemDTO> {
  const existing = await getFaceListOwnedByUser(id, userId);
  if (!existing) {
    throw notFound("Allow list not found");
  }
  const name = parseFaceListName(rawName);
  const updated = await updateFaceListName(id, name);
  return toFaceListItemDTO(updated);
}
