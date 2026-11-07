/**
 * Fixed-window, in-memory rate limiting. Enough for one web pod; counters reset when the pod restarts.
 */
import { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { tooManyRequests } from "../errors";

type Bucket = { count: number; resetAt: number };

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
 * Limits each key to `max` requests per window.
 *
 * Supports two calling conventions:
 * 1. `rateLimit(base, keyOf?, group?)`: builds a 60-second limiter using a base per-minute limit scaled by
 *    RATE_LIMIT_MULTIPLIER ("general") or TRANSFER_RATE_LIMIT_MULTIPLIER ("transfer").
 * 2. `rateLimit(windowMs, max, keyOf?)`: builds a limiter with explicit windowMs and max count.
 *    Used for tests or custom window configurations.
 */
export function rateLimit(
  base: number,
  keyOf?: (request: Request) => string,
  group?: RateLimitGroup,
): (request: Request, response: Response, next: NextFunction) => void;
export function rateLimit(
  windowMs: number,
  max: number,
  keyOf?: (request: Request) => string,
): (request: Request, response: Response, next: NextFunction) => void;
export function rateLimit(
  baseOrWindowMs: number,
  maxOrKeyOf?: number | ((request: Request) => string),
  keyOfOrGroup?: ((request: Request) => string) | RateLimitGroup,
  _maybeGroup?: RateLimitGroup,
): (request: Request, response: Response, next: NextFunction) => void {
  const isExplicit = typeof maxOrKeyOf === "number";
  const windowMs = isExplicit ? baseOrWindowMs : 60_000;
  const keyOf = isExplicit
    ? typeof keyOfOrGroup === "function"
      ? keyOfOrGroup
      : clientIp
    : typeof maxOrKeyOf === "function"
      ? maxOrKeyOf
      : clientIp;
  const group: RateLimitGroup = !isExplicit && typeof keyOfOrGroup === "string" ? keyOfOrGroup : "general";

  const buckets = new Map<string, Bucket>();
  let nextSweep = Date.now() + windowMs;

  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    // Drop finished windows once per window so the map does not grow with every IP ever seen.
    if (now >= nextSweep) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      nextSweep = now + windowMs;
    }

    const multiplier = group === "transfer" ? config.TRANSFER_RATE_LIMIT_MULTIPLIER : config.RATE_LIMIT_MULTIPLIER;
    const max = isExplicit ? maxOrKeyOf : scaleLimit(baseOrWindowMs, multiplier);
    const key = keyOf(request);
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > max) {
      response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
      next(tooManyRequests("Too many requests", "RATE_LIMITED"));
      return;
    }
    next();
  };
}

/** Helper that builds a per-minute rate limiter with RATE_LIMIT_MULTIPLIER applied. */
export function buildRateLimiter(
  base: number,
  keyOf: (request: Request) => string = clientIp,
  windowMs = 60_000,
  multiplier: number = config.RATE_LIMIT_MULTIPLIER,
) {
  return rateLimit(windowMs, scaleLimit(base, multiplier), keyOf);
}

export const createRateLimiter = buildRateLimiter;

/** Key for routes behind requireAuth: limit per account, falling back to the IP. */
export function userKey(request: Request): string {
  return request.authUser?.id ?? clientIp(request);
}
