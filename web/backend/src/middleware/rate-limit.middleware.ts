/**
 * Fixed-window, in-memory rate limiting. Enough for one web pod; counters reset when the pod restarts.
 */
import { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { tooManyRequests } from "../errors";

type Bucket = { count: number; resetAt: number };

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
 * Limits each key to `max` requests per `windowMs`. The key is the client IP unless `keyOf` gives another one
 * (for example the user id on routes that run after requireAuth).
 */
export function rateLimit(windowMs: number, max: number, keyOf: (request: Request) => string = clientIp) {
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

/** Key for routes behind requireAuth: limit per account, falling back to the IP. */
export function userKey(request: Request): string {
  return request.authUser?.id ?? clientIp(request);
}
