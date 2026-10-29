import { Router } from "express";
import {
  getHealthHandler,
  getReadyHandler,
  getSystemStatsHandler,
} from "../controllers/system.controller";

export const systemRouter = Router();

systemRouter.get("/health", getHealthHandler);
systemRouter.get("/ready", getReadyHandler);
systemRouter.get("/api/system/stats", getSystemStatsHandler);
