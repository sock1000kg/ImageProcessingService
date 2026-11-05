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
}): Promise<FaceList> {
  return prisma.faceList.create({
    data: {
      id: data.id,
      userId: data.userId,
      name: data.name,
      keys: data.keys,
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
