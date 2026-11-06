/**
 * Database repository managing user-saved face reference lists.
 *
 * Biometric data retention policy: Face lists store biometric reference keys that users explicitly opt
 * to persist. Unlike temporary batch whitelist files which are purged when jobs finish, saved face lists
 * remain until the user explicitly requests their deletion. Deletion removes the storage objects immediately.
 */
import { prisma } from "../db/prisma";
import { FaceList } from "../generated/prisma/client";

/**
 * Creates and persists a new FaceList record owned by the specified user.
 */
export async function createFaceList(data: {
  id: string;
  userId: string;
  name: string;
  keys: string[];
  faceNames?: Record<string, string>;
}): Promise<FaceList> {
  return prisma.faceList.create({
    data: {
      id: data.id,
      userId: data.userId,
      name: data.name,
      keys: data.keys,
      faceNames: data.faceNames ?? {},
    },
  });
}

/**
 * Lists all saved face lists owned by a specific user, ordered newest first.
 *
 * Why owner-scoped: Biometric reference profiles are strictly private to the user account that
 * uploaded them and must never be exposed across accounts.
 */
export async function listFaceListsByUserId(userId: string): Promise<FaceList[]> {
  return prisma.faceList.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Retrieves a single face list by ID, strictly scoped to its owner.
 *
 * Returns null if the list does not exist or belongs to another user, enforcing 404 behavior.
 */
export async function getFaceListOwnedByUser(id: string, userId: string): Promise<FaceList | null> {
  return prisma.faceList.findFirst({
    where: { id, userId },
  });
}

/**
 * Deletes a face list record by ID for a specific user.
 *
 * Why immediate DB deletion: Once storage objects have been purged, the database record is removed
 * immediately to maintain privacy compliance without lingering metadata.
 */
export async function deleteFaceListRow(id: string, userId: string): Promise<boolean> {
  const result = await prisma.faceList.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

/**
 * Atomically appends new keys and names to an existing face list if the total count does not exceed max.
 *
 * Why atomic SQL: Prevents race conditions from multi-tab or concurrent uploads by checking
 * cardinality(keys) + new_count <= max in the same statement as the update. Merges face_names JSONB.
 */
export async function appendFaceListKeys(
  id: string,
  userId: string,
  keys: string[],
  faceNames: Record<string, string>,
  max: number = 5,
): Promise<FaceList | null> {
  const namesJson = JSON.stringify(faceNames);

  const rows = await prisma.$queryRaw<FaceList[]>`
    UPDATE face_lists
    SET keys = keys || ${keys}::text[],
        face_names = face_names || ${namesJson}::jsonb
    WHERE id = ${id}::uuid
      AND user_id = ${userId}::uuid
      AND cardinality(keys) + ${keys.length} <= ${max}
    RETURNING id, user_id AS "userId", name, keys, face_names AS "faceNames", created_at AS "createdAt"
  `;
  return rows[0] ?? null;
}

/**
 * Updates the display name of an existing face list record.
 *
 * Why centralized update: Encapsulates database mutations and mirrors updateBatchName.
 */
export async function updateFaceListName(id: string, name: string): Promise<FaceList> {
  return prisma.faceList.update({
    where: { id },
    data: { name },
  });
}

/**
 * Atomically removes a specific storage key and its display name from a face list.
 *
 * Why remove by key: Removes the exact storage key rather than an array index so a repeated request
 * or concurrent modification cannot inadvertently remove a different enrolled face. Strips name from JSONB map.
 */
export async function removeFaceListKey(id: string, userId: string, key: string): Promise<FaceList | null> {
  const rows = await prisma.$queryRaw<FaceList[]>`
    UPDATE face_lists
    SET keys = array_remove(keys, ${key}::text),
        face_names = face_names - ${key}::text
    WHERE id = ${id}::uuid
      AND user_id = ${userId}::uuid
    RETURNING id, user_id AS "userId", name, keys, face_names AS "faceNames", created_at AS "createdAt"
  `;
  return rows[0] ?? null;
}
