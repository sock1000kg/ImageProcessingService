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
import { createAccessToken, hashPassword, normalizeEmail, verifyAccessToken, verifyPassword } from "../../src/auth";

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
