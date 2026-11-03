import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config";
import { badRequest, conflict, unauthorized } from "./errors";
import { prisma } from "./db/prisma";

const scrypt = promisify(scryptCallback);
const ACCESS_COOKIE = "imgproc_refresh";

export type AuthUser = { id: string; email: string };
export type AuthRequestUser = AuthUser;

function requireJwtSecret(): string {
  if (!config.JWT_SECRET) {
    throw new Error("JWT_SECRET is required for authentication");
  }
  return config.JWT_SECRET;
}

/** Constant-time string compare (hashing first makes the lengths equal), so timing does not leak the key. */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload: Record<string, string | number>): string {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encode(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const signature = createHmac("sha256", requireJwtSecret()).update(input).digest("base64url");
  return `${input}.${signature}`;
}

export function createAccessToken(user: AuthUser): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ sub: user.id, email: user.email, iat: now, exp: now + config.JWT_ACCESS_TTL });
}

export function verifyAccessToken(token: string): AuthUser {
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized("Invalid access token", "INVALID_TOKEN");
  const input = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", requireJwtSecret()).update(input).digest();
  const received = Buffer.from(parts[2], "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw unauthorized("Invalid access token", "INVALID_TOKEN");
  }
  let payload: { sub?: unknown; email?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as typeof payload;
  } catch {
    throw unauthorized("Invalid access token", "INVALID_TOKEN");
  }
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw unauthorized("Access token expired or invalid", "INVALID_TOKEN");
  }
  return { id: payload.sub, email: payload.email };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function setRefreshCookie(response: { setHeader: (name: string, value: string) => void }, token: string): void {
  const attributes = [
    `${ACCESS_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/api/auth",
    `Max-Age=${config.JWT_REFRESH_TTL}`,
    "SameSite=Lax",
  ];
  if (config.COOKIE_SECURE) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

export function clearRefreshCookie(response: { setHeader: (name: string, value: string) => void }): void {
  response.setHeader("Set-Cookie", `${ACCESS_COOKIE}=; HttpOnly; Path=/api/auth; Max-Age=0; SameSite=Lax`);
}

export function readRefreshCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACCESS_COOKIE}=`));
  return cookie ? decodeURIComponent(cookie.slice(ACCESS_COOKIE.length + 1)) : null;
}

export async function registerUser(emailInput: string, password: string, registerKey: string): Promise<AuthUser> {
  if (!config.REGISTER_KEY) throw badRequest("Registration is disabled", "REGISTRATION_DISABLED");
  if (!sameSecret(registerKey, config.REGISTER_KEY))
    throw unauthorized("Invalid registration key", "INVALID_REGISTER_KEY");
  const email = normalizeEmail(emailInput);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("Unable to create account", "REGISTRATION_CONFLICT");
  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({ data: { email, passwordHash } });
    return { id: user.id, email: user.email };
  } catch (error) {
    // Unique violation: another request registered the same email between the check and the insert.
    if ((error as { code?: unknown }).code === "P2002")
      throw conflict("Unable to create account", "REGISTRATION_CONFLICT");
    throw error;
  }
}

export async function authenticateUser(emailInput: string, password: string): Promise<AuthUser> {
  const email = normalizeEmail(emailInput);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }
  return { id: user.id, email: user.email };
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(48).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + config.JWT_REFRESH_TTL * 1000),
    },
  });
  return token;
}

export async function rotateRefreshToken(token: string): Promise<{ user: AuthUser; token: string }> {
  const tokenHash = hashRefreshToken(token);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
    throw unauthorized("Refresh token expired or invalid", "INVALID_REFRESH_TOKEN");
  }
  // Revoke only if still unrevoked: of two concurrent refreshes with the same token, exactly one wins.
  const revoked = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) {
    throw unauthorized("Refresh token expired or invalid", "INVALID_REFRESH_TOKEN");
  }
  const next = await issueRefreshToken(stored.userId);
  return { user: { id: stored.user.id, email: stored.user.email }, token: next };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export { ACCESS_COOKIE };
