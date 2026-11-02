import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  authenticateUser,
  clearRefreshCookie,
  createAccessToken,
  issueRefreshToken,
  readRefreshCookie,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
  setRefreshCookie,
} from "../auth";
import { badRequest } from "../errors";

const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
});

const registerSchema = credentialsSchema.extend({
  registerKey: z.string().min(1),
});

function publicUser(user: { id: string; email: string }) {
  return { id: user.id, email: user.email };
}

export async function registerHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const body = registerSchema.parse(request.body);
    const user = await registerUser(body.email, body.password, body.registerKey);
    const refresh = await issueRefreshToken(user.id);
    setRefreshCookie(response, refresh);
    response.status(201).json({ user: publicUser(user), accessToken: createAccessToken(user) });
  } catch (error) {
    next(error);
  }
}

export async function loginHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const body = credentialsSchema.parse(request.body);
    const user = await authenticateUser(body.email, body.password);
    const refresh = await issueRefreshToken(user.id);
    setRefreshCookie(response, refresh);
    response.json({ user: publicUser(user), accessToken: createAccessToken(user) });
  } catch (error) {
    next(error);
  }
}

export async function refreshHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const refresh = readRefreshCookie(request.header("cookie"));
    if (!refresh) throw badRequest("Refresh token is required", "REFRESH_TOKEN_REQUIRED");
    const rotated = await rotateRefreshToken(refresh);
    setRefreshCookie(response, rotated.token);
    response.json({ user: publicUser(rotated.user), accessToken: createAccessToken(rotated.user) });
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const refresh = readRefreshCookie(request.header("cookie"));
    if (refresh) await revokeRefreshToken(refresh);
    clearRefreshCookie(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}

export function meHandler(request: Request, response: Response): void {
  response.json({ user: publicUser(request.authUser!) });
}
