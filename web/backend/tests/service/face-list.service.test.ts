import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/prisma";
import { closeDatabase } from "../../src/db";
import { appendFaceListKeys, createFaceList, removeFaceListKey } from "../../src/repositories/face-list.repository";

describe("Face List Real SQL Integration Tests (Task 49 & 50)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await prisma.faceList.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
  });

  it("atomically appends keys, respects cap of 5, and prevents concurrent overflow", async () => {
    const userId = randomUUID();
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        email: `sqllist-${userId}@example.com`,
        passwordHash: "hash-dummy",
      },
    });

    const listId = randomUUID();
    const initial = await createFaceList({
      id: listId,
      userId,
      name: "Family Allowed",
      keys: [`lists/${userId}/${listId}/face-1.jpg`, `lists/${userId}/${listId}/face-2.jpg`],
    });
    expect(initial.keys).toHaveLength(2);

    // 1. Append 2 keys: 2 + 2 = 4 <= 5
    const updated1 = await appendFaceListKeys(
      listId,
      userId,
      [`lists/${userId}/${listId}/face-3.jpg`, `lists/${userId}/${listId}/face-4.jpg`],
      {},
      5,
    );
    expect(updated1).not.toBeNull();
    expect(updated1?.keys).toHaveLength(4);

    // 2. Concurrency test: Two concurrent adds of 1 key each to a list that has 4 keys
    const p1 = appendFaceListKeys(listId, userId, [`lists/${userId}/${listId}/face-concurrent-a.jpg`], {}, 5);
    const p2 = appendFaceListKeys(listId, userId, [`lists/${userId}/${listId}/face-concurrent-b.jpg`], {}, 5);

    const [res1, res2] = await Promise.all([p1, p2]);
    const successes = [res1, res2].filter((r) => r !== null);
    const failures = [res1, res2].filter((r) => r === null);

    // Exactly one must succeed and one must fail
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(successes[0]?.keys).toHaveLength(5);

    // 3. Further add when at 5 must return null (atomic cap check)
    const overflow = await appendFaceListKeys(listId, userId, [`lists/${userId}/${listId}/face-overflow.jpg`], {}, 5);
    expect(overflow).toBeNull();

    // Verify database row still has exactly 5 keys
    const finalRow = await prisma.faceList.findUnique({ where: { id: listId } });
    expect(finalRow?.keys).toHaveLength(5);
  });

  it("atomically removes a key via array_remove, ensures repeated delete does not remove another face, and scopes to owner", async () => {
    const userId = randomUUID();
    const otherUserId = randomUUID();
    createdUserIds.push(userId, otherUserId);

    await prisma.user.createMany({
      data: [
        { id: userId, email: `sqldelete-${userId}@example.com`, passwordHash: "dummy" },
        { id: otherUserId, email: `sqldelete-${otherUserId}@example.com`, passwordHash: "dummy" },
      ],
    });

    const listId = randomUUID();
    const key1 = `lists/${userId}/${listId}/face-1.jpg`;
    const key2 = `lists/${userId}/${listId}/face-2.jpg`;
    const key3 = `lists/${userId}/${listId}/face-3.jpg`;

    await createFaceList({
      id: listId,
      userId,
      name: "Team Allowed",
      keys: [key1, key2, key3],
    });

    // 1. Another user cannot remove key
    const unauthorized = await removeFaceListKey(listId, otherUserId, key2);
    expect(unauthorized).toBeNull();
    const rowAfterUnauth = await prisma.faceList.findUnique({ where: { id: listId } });
    expect(rowAfterUnauth?.keys).toEqual([key1, key2, key3]);

    // 2. Owner removes key2
    const afterDelete = await removeFaceListKey(listId, userId, key2);
    expect(afterDelete).not.toBeNull();
    expect(afterDelete?.keys).toEqual([key1, key3]);

    // Verify persisted in PostgreSQL
    const rowInDb = await prisma.faceList.findUnique({ where: { id: listId } });
    expect(rowInDb?.keys).toEqual([key1, key3]);

    // 3. Repeated delete of key2 does NOT remove another face
    const repeated = await removeFaceListKey(listId, userId, key2);
    expect(repeated).not.toBeNull();
    expect(repeated?.keys).toEqual([key1, key3]);

    const rowAfterRepeat = await prisma.faceList.findUnique({ where: { id: listId } });
    expect(rowAfterRepeat?.keys).toEqual([key1, key3]);
  });

  it("atomically appends face_names JSONB map alongside keys and drops name on remove", async () => {
    const userId = randomUUID();
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        email: `sqlnames-${userId}@example.com`,
        passwordHash: "hash-dummy",
      },
    });

    const listId = randomUUID();
    const key1 = `lists/${userId}/${listId}/face-1.jpg`;
    const key2 = `lists/${userId}/${listId}/face-2.jpg`;
    const key3 = `lists/${userId}/${listId}/face-3.jpg`;

    // 1. Create list with initial face_names
    const initial = await createFaceList({
      id: listId,
      userId,
      name: "Names Test",
      keys: [key1],
      faceNames: { [key1]: "Alice.jpg" },
    });
    expect(initial.keys).toEqual([key1]);
    expect((initial as any).faceNames).toEqual({ [key1]: "Alice.jpg" });

    // 2. Atomically append keys and names
    const appended = await appendFaceListKeys(
      listId,
      userId,
      [key2, key3],
      { [key2]: "ảnh Đức.jpg", [key3]: "Bob.png" },
      5,
    );
    expect(appended).not.toBeNull();
    expect(appended?.keys).toEqual([key1, key2, key3]);
    expect((appended as any)?.faceNames).toEqual({
      [key1]: "Alice.jpg",
      [key2]: "ảnh Đức.jpg",
      [key3]: "Bob.png",
    });

    // Verify row persisted in real PostgreSQL
    const rowInDb = await prisma.faceList.findUnique({ where: { id: listId } });
    expect(rowInDb?.faceNames).toEqual({
      [key1]: "Alice.jpg",
      [key2]: "ảnh Đức.jpg",
      [key3]: "Bob.png",
    });

    // 3. Atomically remove key2: drops key and removes key2 from face_names
    const removed = await removeFaceListKey(listId, userId, key2);
    expect(removed).not.toBeNull();
    expect(removed?.keys).toEqual([key1, key3]);
    expect((removed as any)?.faceNames).toEqual({
      [key1]: "Alice.jpg",
      [key3]: "Bob.png",
    });

    // Verify PostgreSQL row after removal
    const rowAfterRemove = await prisma.faceList.findUnique({ where: { id: listId } });
    expect(rowAfterRemove?.keys).toEqual([key1, key3]);
    expect(rowAfterRemove?.faceNames).toEqual({
      [key1]: "Alice.jpg",
      [key3]: "Bob.png",
    });
  });
});
