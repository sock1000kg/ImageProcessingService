import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { config } from "../../src/config";
import {
  RATE_LIMIT_BASES,
  buildRateLimiter,
  clientIp,
  createRateLimiter,
  rateLimit,
  scaleLimit,
} from "../../src/middleware/rate-limit.middleware";
import { authLimit, refreshLimit } from "../../src/routes/auth.routes";

function fakeRequest(ip: string, headers: Record<string, string> = {}): Request {
  return { ip, socket: {}, header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

function run(limiter: ReturnType<typeof rateLimit>, request: Request): unknown {
  const next = vi.fn();
  limiter(request, { setHeader: vi.fn() } as unknown as Response, next);
  return next.mock.calls[0][0];
}

describe("scaleLimit", () => {
  it("scales base by multiplier with Math.max(1, Math.round(base * multiplier))", () => {
    expect(scaleLimit(10, 1)).toBe(10);
    expect(scaleLimit(10, 2)).toBe(20);
    expect(scaleLimit(10, 0.5)).toBe(5);
    expect(scaleLimit(300, 100)).toBe(30000);
    // Rounds properly
    expect(scaleLimit(10, 1.45)).toBe(15);
    expect(scaleLimit(10, 1.2)).toBe(12);
    // Never drops below 1
    expect(scaleLimit(10, 0.01)).toBe(1);
    expect(scaleLimit(1, 0.1)).toBe(1);
  });
});

describe("rateLimit", () => {
  const originalMultiplier = config.RATE_LIMIT_MULTIPLIER;

  afterEach(() => {
    config.RATE_LIMIT_MULTIPLIER = originalMultiplier;
  });

  it("allows max requests per window, then answers 429", () => {
    const limiter = rateLimit(60_000, 2);
    const request = fakeRequest("10.0.0.1");
    expect(run(limiter, request)).toBeUndefined();
    expect(run(limiter, request)).toBeUndefined();
    expect(run(limiter, request)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    // A different client has its own bucket.
    expect(run(limiter, fakeRequest("10.0.0.2"))).toBeUndefined();
  });

  it("keeps separate counters per limiter", () => {
    const a = rateLimit(60_000, 1);
    const b = rateLimit(60_000, 1);
    const request = fakeRequest("10.0.0.3");
    expect(run(a, request)).toBeUndefined();
    expect(run(b, request)).toBeUndefined();
  });

  it("multiplier 1: the 11th login in a window gets 429 while /refresh from the same IP still works", () => {
    config.RATE_LIMIT_MULTIPLIER = 1;
    const loginLimiter = rateLimit(RATE_LIMIT_BASES.auth);
    const refreshLimiter = rateLimit(RATE_LIMIT_BASES.refresh);
    const ip = "192.168.1.100";
    const req = fakeRequest(ip);

    // Base auth is 10/min: 10 logins pass
    for (let i = 0; i < 10; i++) {
      expect(run(loginLimiter, req)).toBeUndefined();
    }
    // The 11th login gets 429 RATE_LIMITED
    expect(run(loginLimiter, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });

    // /refresh from the same IP still works (separate bucket with base 60)
    expect(run(refreshLimiter, req)).toBeUndefined();
  });

  it("multiplier 2: 20 logins pass before getting rate limited", () => {
    config.RATE_LIMIT_MULTIPLIER = 2;
    const loginLimiter = rateLimit(RATE_LIMIT_BASES.auth);
    const ip = "192.168.1.101";
    const req = fakeRequest(ip);

    // Multiplier 2 scales base 10 to 20: 20 logins pass
    for (let i = 0; i < 20; i++) {
      expect(run(loginLimiter, req)).toBeUndefined();
    }
    // The 21st login gets 429 RATE_LIMITED
    expect(run(loginLimiter, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });

  it("exported authLimit and refreshLimit routes have separate buckets", () => {
    const ip = "172.20.0.50";
    const req = fakeRequest(ip);

    for (let i = 0; i < 10; i++) {
      expect(run(authLimit, req)).toBeUndefined();
    }
    expect(run(authLimit, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    // refreshLimit bucket from the same IP is unaffected
    expect(run(refreshLimit, req)).toBeUndefined();
  });

  it("buildRateLimiter / createRateLimiter builds a limiter with explicit multiplier", () => {
    const limiter = buildRateLimiter(RATE_LIMIT_BASES.auth, clientIp, 60_000, 3);
    const req = fakeRequest("10.0.0.99");
    for (let i = 0; i < 30; i++) {
      expect(run(limiter, req)).toBeUndefined();
    }
    expect(run(limiter, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(createRateLimiter).toBe(buildRateLimiter);
  });
});

describe("clientIp", () => {
  it("uses the configured proxy header, falling back to the socket address", () => {
    const previous = config.CLIENT_IP_HEADER;
    config.CLIENT_IP_HEADER = "cf-connecting-ip";
    try {
      expect(clientIp(fakeRequest("172.16.0.9", { "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
      expect(clientIp(fakeRequest("172.16.0.9"))).toBe("172.16.0.9");
    } finally {
      config.CLIENT_IP_HEADER = previous;
    }
  });
});
