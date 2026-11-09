/**
 * Data transfer objects and validation schemas for saved face lists.
 */
import { z } from "zod";
import { config } from "../config";
import { badRequest, payloadTooLarge } from "../errors";
import { CONTROL_CHAR_REGEX, MAX_FACE_LIST_FILES } from "./validation.dto";

export interface FaceListItemDTO {
  id: string;
  name: string;
  faceCount: number;
  faceNames: (string | null)[];
  faceIds: string[];
  createdAt: string;
}

export interface FaceListResponseDTO {
  list: FaceListItemDTO;
}

export interface FaceListsResponseDTO {
  lists: FaceListItemDTO[];
}

export const faceListNameSchema = z
  .string()
  .superRefine((val, ctx) => {
    if (CONTROL_CHAR_REGEX.test(val)) {
      ctx.addIssue({
        code: "custom",
        message: "Face list name must not contain control characters",
      });
    }
  })
  .transform((val) => val.trim())
  .refine((val) => val.length >= 1, {
    message: "Face list name is required",
  })
  .refine((val) => val.length <= 100, {
    message: "Face list name must be at most 100 characters",
  });

export function parseFaceListName(input: unknown): string {
  if (typeof input !== "string") {
    throw badRequest("Face list name is required", "VALIDATION_ERROR");
  }
  try {
    return faceListNameSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw badRequest(error.issues[0]?.message ?? "Invalid face list name", "VALIDATION_ERROR");
    }
    throw error;
  }
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Validates uploaded face files for face list creation.
 * Follows identical type, count, and size constraints as whitelist uploads (1-5 files, JPEG/PNG/WEBP).
 */
export function validateFaceListFiles(files: Express.Multer.File[]): void {
  if (!files || files.length === 0) {
    throw badRequest("At least one face image is required", "VALIDATION_ERROR");
  }
  if (files.length > MAX_FACE_LIST_FILES) {
    throw badRequest(`Too many face files: maximum allowed is ${MAX_FACE_LIST_FILES}`, "VALIDATION_ERROR");
  }

  for (const file of files) {
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `Face file ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`,
        "FILE_TOO_LARGE",
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw badRequest(
        `Face file ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
        "VALIDATION_ERROR",
      );
    }
  }
}
