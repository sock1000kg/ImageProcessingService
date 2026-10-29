import { Router } from "express";
import { getJobHandler, getJobOriginalHandler } from "../controllers/jobs.controller";

export const jobsRouter = Router();

jobsRouter.get("/:id", getJobHandler);
jobsRouter.get("/:id/original", getJobOriginalHandler);
