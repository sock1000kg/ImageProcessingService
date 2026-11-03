import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { config } from "../../src/config";
import { prisma } from "../../src/db/prisma";
import {
  createAccessToken,
  hashPassword,
  normalizeEmail,
  registerUser,
  rotateRefreshToken,
  verifyAccessToken,
  verifyPassword,
} from "../../src/auth";

describe("Authentication primitives", () => {
  beforeEach(() => {
    config.JWT_SECRET = "test-secret-with-at-least-32-characters";
  });

  it("normalizes email consistently", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it("hashes and verifies passwords without storing the original value", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("signs and verifies an access token", () => {
    const user = { id: "user-1", email: "user@example.com" };
    expect(verifyAccessToken(createAccessToken(user))).toEqual(user);
  });

  it("rejects a tampered access token", () => {
    const token = createAccessToken({ id: "user-1", email: "user@example.com" });
    expect(() => verifyAccessToken(`${token}tampered`)).toThrow("Invalid access token");
  });
});

describe("Refresh rotation and registration races", () => {
  beforeEach(() => {
    config.JWT_SECRET = "test-secret-with-at-least-32-characters";
    config.REGISTER_KEY = "team-key";
    vi.clearAllMocks();
  });

  it("rejects the second of two concurrent refreshes with the same token", async () => {
    const stored = {
      id: "token-1",
      userId: "user-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "user-1", email: "user@example.com" },
    };
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(stored as never);
    // The first revoke updates the row; the second finds it already revoked.
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never);

    const results = await Promise.allSettled([rotateRefreshToken("raw"), rotateRefreshToken("raw")]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when a concurrent registration wins the unique email insert", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(registerUser("a@example.com", "password123", "team-key")).rejects.toMatchObject({
      status: 409,
      code: "REGISTRATION_CONFLICT",
    });
  });

  it("rejects a wrong registration key", async () => {
    await expect(registerUser("a@example.com", "password123", "nope")).rejects.toMatchObject({ status: 401 });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
