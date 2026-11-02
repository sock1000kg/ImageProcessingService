import { NextFunction, Request, Response } from "express";
import { unauthorized } from "../errors";
import { verifyAccessToken } from "../auth";

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string };
    }
  }
}

export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(unauthorized("Authentication required", "AUTH_REQUIRED"));
    return;
  }
  try {
    request.authUser = verifyAccessToken(header.slice("Bearer ".length));
    next();
  } catch (error) {
    next(error);
  }
}
