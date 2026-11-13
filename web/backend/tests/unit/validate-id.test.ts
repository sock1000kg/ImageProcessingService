import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { validateId } from "../../src/middleware/validate-id.middleware";

describe("validateId middleware", () => {
  const validUuid = "123e4567-e89b-12d3-a456-426614174000";

  it("calls next() with no arguments for a valid UUID", () => {
    const middleware = validateId("Item");
    const req = { params: { id: validUuid } } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next with a 404 error and does not call next() for a malformed id", () => {
    const middleware = validateId("Item");
    const req = { params: { id: "not-a-uuid" } } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        code: "NOT_FOUND",
        message: "Item not found",
      }),
    );
  });
});
