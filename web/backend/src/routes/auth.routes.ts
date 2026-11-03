import { Router } from "express";
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { rateLimit } from "../middleware/rate-limit.middleware";

export const authRouter = Router();
// Strict: slows password and register-key guessing. Per IP, since there is no user yet.
const strictAuthLimit = rateLimit(60_000, 10);

authRouter.post("/register", strictAuthLimit, registerHandler);
authRouter.post("/login", strictAuthLimit, loginHandler);
authRouter.post("/refresh", strictAuthLimit, refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAuth, meHandler);
