/**
 * Express middleware validating that request.params.id conforms to a valid UUID format.
 *
 * Why: This is the only place id format is checked at the HTTP boundary. Downstream
 * controllers and services assume they receive a valid id, eliminating redundant
 * checks across the stack.
 */
import { NextFunction, Request, Response } from "express";
import { notFound } from "../errors";
import { idParamSchema } from "../dto/validation.dto";

export function validateId(resource: string) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const result = idParamSchema.safeParse(request.params);
    if (!result.success) {
      next(notFound(`${resource} not found`));
      return;
    }
    next();
  };
}
