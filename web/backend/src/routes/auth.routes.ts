import { Router } from "express";
import {
  loginHandler,
  changePasswordHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { RATE_LIMIT_BASES, rateLimit } from "../middleware/rate-limit.middleware";

export const authRouter = Router();
// Strict: slows password and register-key guessing. Per IP, shared by register and login.
export const authLimit = rateLimit(RATE_LIMIT_BASES.auth);
// Separate bucket for silent token refreshes so they don't consume the login attempt budget.
export const refreshLimit = rateLimit(RATE_LIMIT_BASES.refresh);

authRouter.post("/register", authLimit, registerHandler);
authRouter.post("/login", authLimit, loginHandler);
authRouter.post("/refresh", refreshLimit, refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAuth, meHandler);
authRouter.post("/change-password", requireAuth, authLimit, changePasswordHandler);
