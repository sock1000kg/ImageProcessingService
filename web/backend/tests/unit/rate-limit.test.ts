import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { config } from "../../src/config";
import { RATE_LIMIT_BASES, clientIp, rateLimit, scaleLimit } from "../../src/middleware/rate-limit.middleware";
import { authLimit, refreshLimit } from "../../src/routes/auth.routes";

function fakeRequest(ip: string, headers: Record<string, string> = {}): Request {
  return { ip, socket: {}, header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

/** Runs the limiter once and returns what it passed to next(): nothing when allowed, the 429 error when not. */
async function run(limiter: ReturnType<typeof rateLimit>, request: Request): Promise<unknown> {
  const next = vi.fn();
  const response = { setHeader: vi.fn(), getHeader: vi.fn(), headersSent: false, append: vi.fn() };
  await limiter(request, response as unknown as Response, next);
  return next.mock.calls[0][0];
}

describe("scaleLimit", () => {
  it("scales base by multiplier with Math.max(1, Math.round(base * multiplier))", async () => {
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
  const originalTransferMultiplier = config.TRANSFER_RATE_LIMIT_MULTIPLIER;

  afterEach(() => {
    config.RATE_LIMIT_MULTIPLIER = originalMultiplier;
    config.TRANSFER_RATE_LIMIT_MULTIPLIER = originalTransferMultiplier;
  });

  it("allows the base number of requests per minute, then answers 429", async () => {
    const limiter = rateLimit(2);
    const request = fakeRequest("10.0.0.1");
    expect(await run(limiter, request)).toBeUndefined();
    expect(await run(limiter, request)).toBeUndefined();
    expect(await run(limiter, request)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    // A different client has its own bucket.
    expect(await run(limiter, fakeRequest("10.0.0.2"))).toBeUndefined();
  });

  it("keeps separate counters per limiter", async () => {
    const a = rateLimit(1);
    const b = rateLimit(1);
    const request = fakeRequest("10.0.0.3");
    expect(await run(a, request)).toBeUndefined();
    expect(await run(b, request)).toBeUndefined();
  });

  it("multiplier 1: the 11th login in a window gets 429 while /refresh from the same IP still works", async () => {
    config.RATE_LIMIT_MULTIPLIER = 1;
    const loginLimiter = rateLimit(RATE_LIMIT_BASES.auth);
    const refreshLimiter = rateLimit(RATE_LIMIT_BASES.refresh);
    const ip = "192.168.1.100";
    const req = fakeRequest(ip);

    // Base auth is 10/min: 10 logins pass
    for (let i = 0; i < 10; i++) {
      expect(await run(loginLimiter, req)).toBeUndefined();
    }
    // The 11th login gets 429 RATE_LIMITED
    expect(await run(loginLimiter, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });

    // /refresh from the same IP still works (separate bucket with base 60)
    expect(await run(refreshLimiter, req)).toBeUndefined();
  });

  it("multiplier 2: 20 logins pass before getting rate limited", async () => {
    config.RATE_LIMIT_MULTIPLIER = 2;
    const loginLimiter = rateLimit(RATE_LIMIT_BASES.auth);
    const ip = "192.168.1.101";
    const req = fakeRequest(ip);

    // Multiplier 2 scales base 10 to 20: 20 logins pass
    for (let i = 0; i < 20; i++) {
      expect(await run(loginLimiter, req)).toBeUndefined();
    }
    // The 21st login gets 429 RATE_LIMITED
    expect(await run(loginLimiter, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });

  it("exported authLimit and refreshLimit routes have separate buckets", async () => {
    const ip = "172.20.0.50";
    const req = fakeRequest(ip);

    for (let i = 0; i < 10; i++) {
      expect(await run(authLimit, req)).toBeUndefined();
    }
    expect(await run(authLimit, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    // refreshLimit bucket from the same IP is unaffected
    expect(await run(refreshLimit, req)).toBeUndefined();
  });

  it("raising TRANSFER_RATE_LIMIT_MULTIPLIER does not raise the login limit", async () => {
    config.RATE_LIMIT_MULTIPLIER = 1;
    config.TRANSFER_RATE_LIMIT_MULTIPLIER = 100;
    const loginLimiter = rateLimit(RATE_LIMIT_BASES.auth);
    const req = fakeRequest("192.168.2.1");
    for (let i = 0; i < 10; i++) {
      expect(await run(loginLimiter, req)).toBeUndefined();
    }
    expect(await run(loginLimiter, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });

  it("raising RATE_LIMIT_MULTIPLIER does not raise a transfer limit", async () => {
    config.RATE_LIMIT_MULTIPLIER = 100;
    config.TRANSFER_RATE_LIMIT_MULTIPLIER = 1;
    const transferLimiter = rateLimit(RATE_LIMIT_BASES.createBatch, clientIp, "transfer");
    const req = fakeRequest("192.168.2.2");
    for (let i = 0; i < 20; i++) {
      expect(await run(transferLimiter, req)).toBeUndefined();
    }
    expect(await run(transferLimiter, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });

  it("a transfer limiter scales by its own multiplier", async () => {
    config.RATE_LIMIT_MULTIPLIER = 1;
    config.TRANSFER_RATE_LIMIT_MULTIPLIER = 2;
    const transferLimiter = rateLimit(RATE_LIMIT_BASES.createBatch, clientIp, "transfer");
    const req = fakeRequest("192.168.2.3");
    for (let i = 0; i < 40; i++) {
      expect(await run(transferLimiter, req)).toBeUndefined();
    }
    expect(await run(transferLimiter, req)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });
});

describe("clientIp", () => {
  it("uses the configured proxy header, falling back to the socket address", async () => {
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
