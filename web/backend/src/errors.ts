/**
 * Standard HTTP error models, factory constructors, and global error middleware.
 */
import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";

export interface ErrorDTO {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function badRequest(message: string, code = "BAD_REQUEST", details?: unknown): AppError {
  return new AppError(400, code, message, details);
}

export function notFound(message = "Not found", code = "NOT_FOUND"): AppError {
  return new AppError(404, code, message);
}

export function conflict(message: string, code = "CONFLICT"): AppError {
  return new AppError(409, code, message);
}

export function payloadTooLarge(message: string, code = "PAYLOAD_TOO_LARGE"): AppError {
  return new AppError(413, code, message);
}

export function gone(message: string, code = "GONE"): AppError {
  return new AppError(410, code, message);
}

export function unavailable(message: string, code = "SERVICE_UNAVAILABLE"): AppError {
  return new AppError(503, code, message);
}

export function toErrorResponse(error: unknown): { status: number; body: ErrorDTO } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: error.issues,
        },
      },
    };
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return {
        status: 413,
        body: {
          error: {
            code: "FILE_TOO_LARGE",
            message: error.message || "File too large",
          },
        },
      };
    }
    return {
      status: 400,
      body: {
        error: {
          code: "UPLOAD_ERROR",
          message: error.message,
        },
      },
    };
  }

  // Malformed JSON body (from express.json / body-parser SyntaxError)
  const syntaxErr = error as SyntaxError & { status?: unknown; type?: unknown };
  if (
    error instanceof SyntaxError &&
    (syntaxErr.status === 400 ||
      syntaxErr.type === "entity.parse.failed" ||
      error.message.toLowerCase().includes("json"))
  ) {
    return {
      status: 400,
      body: {
        error: {
          code: "INVALID_JSON",
          message: "Invalid JSON in request body",
        },
      },
    };
  }

  // Anything else -> 500 INTERNAL_ERROR with generic message, no internal message leaked
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected internal server error occurred",
      },
    },
  };
}

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const { status, body } = toErrorResponse(error);
  if (status >= 500) {
    console.error("Internal server error:", error);
  }
  res.status(status).json(body);
}
