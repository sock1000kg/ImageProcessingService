/**
 * Per-minute rate limiting with the app's multipliers. In memory: enough for one web pod, counters reset on restart.
 */
import { NextFunction, Request, Response } from "express";
import expressRateLimit from "express-rate-limit";
import { config } from "../config";
import { tooManyRequests } from "../errors";

/**
 * Scales a base per-minute limit using the global RATE_LIMIT_MULTIPLIER.
 * Formula: max = Math.max(1, Math.round(base * RATE_LIMIT_MULTIPLIER))
 */
export function scaleLimit(base: number, multiplier: number = config.RATE_LIMIT_MULTIPLIER): number {
  return Math.max(1, Math.round(base * multiplier));
}

/**
 * Built-in per-minute base limits table. Each endpoint keeps its per-minute default here,
 * scaled by RATE_LIMIT_MULTIPLIER (general group) or TRANSFER_RATE_LIMIT_MULTIPLIER (transfer group):
 * max = Math.max(1, Math.round(base * multiplier)).
 */
export const RATE_LIMIT_BASES = {
  // Slows brute-force password and registration-key guessing. Per IP (shared by /register and /login). Group: general.
  auth: 10,
  // Per IP. Token refresh runs silently in background tabs and on load; separate bucket protects login budget. Group: general.
  refresh: 60,
  // Per account. Caps runaway clients creating draft batches while leaving room for normal usage. Group: transfer.
  createBatch: 20,
  // Per account speed limit (300 files/min). Larger batches wait on rate limits instead of failing. Group: transfer.
  upload: 300,
  // Per account. Allow list creation extracts face embeddings and writes storage; matches batch create rate. Group: general.
  createFaceList: 20,
  // Per account. Protects streaming zip archive creation and signed download token issuance. Group: transfer.
  downloadToken: 30,
} as const;

export type RateLimitKey = keyof typeof RATE_LIMIT_BASES;
export type RateLimitGroup = "general" | "transfer";

/**
 * The caller's IP. Behind Cloudflare + Traefik the socket address is the proxy, so every user would share one
 * bucket; the lab sets CLIENT_IP_HEADER=cf-connecting-ip, which Cloudflare overwrites on every request.
 */
export function clientIp(request: Request): string {
  if (config.CLIENT_IP_HEADER) {
    const value = request.header(config.CLIENT_IP_HEADER);
    if (value) return value.split(",")[0].trim();
  }
  return request.ip ?? request.socket.remoteAddress ?? "unknown";
}

/**
 * Limits each key to `base` requests per minute, scaled by the multiplier of its group ("general" by default, or
 * "transfer" for uploads and downloads), and answers over-limit requests with the app's 429 error.
 *
 * Counting is done by `express-rate-limit` (fixed window, in memory). `limit` is a function so the multiplier is read on
 * every request, which lets it be changed at runtime and keeps tests simple.
 */
export function rateLimit(
  base: number,
  keyOf: (request: Request) => string = clientIp,
  group: RateLimitGroup = "general",
) {
  return expressRateLimit({
    windowMs: 60_000,
    limit: () =>
      scaleLimit(base, group === "transfer" ? config.TRANSFER_RATE_LIMIT_MULTIPLIER : config.RATE_LIMIT_MULTIPLIER),
    keyGenerator: keyOf,
    // Sends Retry-After on a 429 (the browser's upload workers wait on it); no other rate-limit headers are needed.
    legacyHeaders: false,
    standardHeaders: true,
    handler: (_request: Request, _response: Response, next: NextFunction) =>
      next(tooManyRequests("Too many requests", "RATE_LIMITED")),
    // The client IP comes from CLIENT_IP_HEADER (see clientIp), not from Express's proxy settings, so the library's
    // checks of those settings do not apply.
    validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
  });
}

/** Key for routes behind requireAuth: limit per account, falling back to the IP. */
export function userKey(request: Request): string {
  return request.authUser?.id ?? clientIp(request);
}
