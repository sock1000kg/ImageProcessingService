import { NextFunction, Request, Response } from "express";
import { tooManyRequests } from "../errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(windowMs: number, max: number, name: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const key = `${name}:${request.ip}`;
    const now = Date.now();
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
