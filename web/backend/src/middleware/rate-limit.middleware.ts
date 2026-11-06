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
 * scaled by RATE_LIMIT_MULTIPLIER: max = Math.max(1, Math.round(base * RATE_LIMIT_MULTIPLIER)).
 */
export const RATE_LIMIT_BASES = {
  // Slows brute-force password and registration-key guessing. Per IP (shared by /register and /login).
  auth: 10,
  // Per IP. Token refresh runs silently in background tabs and on load; separate bucket protects login budget.
  refresh: 60,
  // Per account. Caps runaway clients creating draft batches while leaving room for normal usage.
  createBatch: 20,
  // Per account. A 100-image batch uploads 1 file per request; leaves headroom for multiple concurrent batches/min.
  upload: 300,
  // Per account. Allow list creation extracts face embeddings and writes storage; matches batch create rate.
  createFaceList: 20,
  // Per account. Protects streaming zip archive creation and signed download token issuance.
  downloadToken: 30,
} as const;

export type RateLimitKey = keyof typeof RATE_LIMIT_BASES;

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
 * 1. `rateLimit(base, keyOf?)`: builds a 60-second limiter using a base per-minute limit scaled by
 *    RATE_LIMIT_MULTIPLIER. Used by all application routes.
 * 2. `rateLimit(windowMs, max, keyOf?)`: builds a limiter with explicit windowMs and max count.
 *    Used for tests or custom window configurations.
 */
export function rateLimit(
  base: number,
  keyOf?: (request: Request) => string,
): (request: Request, response: Response, next: NextFunction) => void;
export function rateLimit(
  windowMs: number,
  max: number,
  keyOf?: (request: Request) => string,
): (request: Request, response: Response, next: NextFunction) => void;
export function rateLimit(
  baseOrWindowMs: number,
  maxOrKeyOf?: number | ((request: Request) => string),
  keyOfArg?: (request: Request) => string,
): (request: Request, response: Response, next: NextFunction) => void {
  const isExplicit = typeof maxOrKeyOf === "number";
  const windowMs = isExplicit ? baseOrWindowMs : 60_000;
  const keyOf = isExplicit ? (keyOfArg ?? clientIp) : typeof maxOrKeyOf === "function" ? maxOrKeyOf : clientIp;

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

    const max = isExplicit ? maxOrKeyOf : scaleLimit(baseOrWindowMs);
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
