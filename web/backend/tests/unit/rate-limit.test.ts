import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { config } from "../../src/config";
import { clientIp, rateLimit } from "../../src/middleware/rate-limit.middleware";

function fakeRequest(ip: string, headers: Record<string, string> = {}): Request {
  return { ip, socket: {}, header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

function run(limiter: ReturnType<typeof rateLimit>, request: Request): unknown {
  const next = vi.fn();
  limiter(request, { setHeader: vi.fn() } as unknown as Response, next);
  return next.mock.calls[0][0];
}

describe("rateLimit", () => {
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
