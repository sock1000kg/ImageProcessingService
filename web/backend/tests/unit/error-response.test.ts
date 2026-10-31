import { describe, expect, it } from "vitest";
import multer from "multer";
import { z, ZodError } from "zod";
import {
  AppError,
  badRequest,
  conflict,
  gone,
  notFound,
  payloadTooLarge,
  toErrorResponse,
  unavailable,
} from "../../src/errors";

describe("toErrorResponse Unit Tests", () => {
  it("maps AppError with its status, code, message and details", () => {
    const error = new AppError(422, "CUSTOM_CODE", "Something unprocessable", [{ field: "test" }]);
    const response = toErrorResponse(error);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: {
        code: "CUSTOM_CODE",
        message: "Something unprocessable",
        details: [{ field: "test" }],
      },
    });
  });

  it("maps AppError helpers correctly", () => {
    const br = badRequest("Invalid query");
    expect(toErrorResponse(br)).toEqual({
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Invalid query" } },
    });

    const nf = notFound("Resource missing");
    expect(toErrorResponse(nf)).toEqual({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Resource missing" } },
    });

    const cf = conflict("Already exists");
    expect(toErrorResponse(cf)).toEqual({
      status: 409,
      body: { error: { code: "CONFLICT", message: "Already exists" } },
    });

    const ptl = payloadTooLarge("Too big", "FILE_TOO_LARGE");
    expect(toErrorResponse(ptl)).toEqual({
      status: 413,
      body: { error: { code: "FILE_TOO_LARGE", message: "Too big" } },
    });

    const gn = gone("Item deleted");
    expect(toErrorResponse(gn)).toEqual({
      status: 410,
      body: { error: { code: "GONE", message: "Item deleted" } },
    });

    const un = unavailable("Database down");
    expect(toErrorResponse(un)).toEqual({
      status: 503,
      body: { error: { code: "SERVICE_UNAVAILABLE", message: "Database down" } },
    });
  });

  it("maps ZodError to 400 VALIDATION_ERROR with issues in details", () => {
    const schema = z.object({
      name: z.string().min(3),
      age: z.number().int().positive(),
    });

    let zodErr: ZodError | null = null;
    try {
      schema.parse({ name: "a", age: -5 });
    } catch (err) {
      if (err instanceof ZodError) zodErr = err;
    }

    expect(zodErr).not.toBeNull();
    const response = toErrorResponse(zodErr);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Validation failed");
    expect(Array.isArray(response.body.error.details)).toBe(true);
    expect((response.body.error.details as any[]).length).toBe(2);
  });

  it("maps Multer LIMIT_FILE_SIZE to 413 FILE_TOO_LARGE", () => {
    const multerErr = new multer.MulterError("LIMIT_FILE_SIZE");
    const response = toErrorResponse(multerErr);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("FILE_TOO_LARGE");
    expect(typeof response.body.error.message).toBe("string");
  });

  it("maps other Multer errors to 400 UPLOAD_ERROR", () => {
    const multerErr = new multer.MulterError("LIMIT_UNEXPECTED_FILE");
    multerErr.message = "Unexpected field";
    const response = toErrorResponse(multerErr);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UPLOAD_ERROR");
    expect(response.body.error.message).toBe("Unexpected field");
  });

  it("maps malformed JSON SyntaxError to 400 INVALID_JSON", () => {
    const jsonErr = Object.assign(new SyntaxError("Unexpected token in JSON at position 5"), {
      status: 400,
      body: "{bad:json",
    });
    const response = toErrorResponse(jsonErr);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(response.body.error.message).toBe("Invalid JSON in request body");
  });

  it("maps unknown internal errors to 500 INTERNAL_ERROR without leaking internal message", () => {
    const dbError = new Error("FATAL: password authentication failed for user postgres at 10.0.0.1:5432");
    const response = toErrorResponse(dbError);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(response.body.error.message).toBe("An unexpected internal server error occurred");
    expect(response.body.error.message).not.toContain("password");
    expect(response.body.error.message).not.toContain("10.0.0.1");
    expect(response.body.error.details).toBeUndefined();
  });
});
