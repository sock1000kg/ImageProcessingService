/**
 * Input request validation utilities, UUID validators, and batch naming constraints.
 */
import { z } from "zod";
import { config, uploadLimitLabel } from "../config";
import { ALLOWED_IMAGE_MIME_TYPES } from "../media-types";
import { badRequest, notFound, payloadTooLarge } from "../errors";
import { redactionStyleSchema } from "./batch-config.dto";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/;

export function formatDefaultBatchName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  return `Batch ${year}-${month}-${day} ${hours}:${minutes}`;
}

export const batchNameSchema = z
  .string()
  .superRefine((val, ctx) => {
    if (CONTROL_CHAR_REGEX.test(val)) {
      ctx.addIssue({
        code: "custom",
        message: "Batch name must not contain control characters",
      });
    }
  })
  .transform((val) => {
    const trimmed = val.trim();
    if (trimmed.length === 0) {
      return formatDefaultBatchName();
    }
    return trimmed;
  })
  .refine((val) => val.length <= 100, {
    message: "Batch name must be at most 100 characters",
  });

export function parseBatchName(input?: unknown): string {
  if (input === undefined || input === null) {
    return formatDefaultBatchName();
  }
  return batchNameSchema.parse(input);
}

export const patchBatchBodySchema = z
  .object({
    name: batchNameSchema,
  })
  .strict();

export const MAX_WHITELIST_FILES = 20;
export const MAX_FACE_LIST_FILES = 5;

/**
 * Extracts and deduplicates faceListIds from request body or options.
 * Supports array of strings, comma/bracketed JSON arrays, repeated fields,
 * and falls back to single faceListId as a one-item alias.
 */
export function parseFaceListIds(body: any): string[] | undefined {
  if (!body) return undefined;
  const items: string[] = [];

  const addRaw = (val: unknown) => {
    if (val === undefined || val === null || val === "") return;
    if (Array.isArray(val)) {
      for (const item of val) {
        addRaw(item);
      }
    } else if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) return;
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            for (const item of parsed) addRaw(item);
            return;
          }
        } catch {
          // not valid JSON, treat as raw string
        }
      }
      items.push(trimmed);
    }
  };

  if (body.faceListIds !== undefined && body.faceListIds !== null) {
    addRaw(body.faceListIds);
  }
  if (body["faceListIds[]"] !== undefined && body["faceListIds[]"] !== null) {
    addRaw(body["faceListIds[]"]);
  }
  if (body.faceListId !== undefined && body.faceListId !== null) {
    addRaw(body.faceListId);
  }

  if (items.length === 0) return undefined;
  return Array.from(new Set(items));
}

export function validateBatchCreation(options: {
  filesPresent?: boolean;
  whitelist?: Express.Multer.File[];
  faceListIds?: string[];
  faceListId?: string;
}): void {
  const { filesPresent = false, whitelist = [] } = options;
  const faceListIds = parseFaceListIds(options);

  if (filesPresent) {
    throw badRequest(
      "Field 'files' is not allowed on batch creation. Upload images individually to POST /api/batches/:id/files",
      "INVALID_FIELD",
    );
  }

  if (faceListIds) {
    for (const id of faceListIds) {
      if (!UUID_REGEX.test(id)) {
        throw notFound("Allow list not found");
      }
    }
  }

  if (whitelist.length > MAX_WHITELIST_FILES) {
    throw badRequest("At most 20 allow list faces per batch", "VALIDATION_ERROR");
  }

  for (const file of whitelist) {
    if (file.size > config.IMAGE_UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `Allow list file ${file.originalname} exceeds the file size limit of ${uploadLimitLabel()}`,
        "FILE_TOO_LARGE",
      );
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw badRequest(
        `Allow list file ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }
}

export function validateSingleUploadFile(file?: Express.Multer.File): Express.Multer.File {
  if (!file) {
    throw badRequest("File is required in field 'file'");
  }
  if (file.size > config.IMAGE_UPLOAD_MAX_BYTES) {
    throw payloadTooLarge(
      `File ${file.originalname} exceeds the file size limit of ${uploadLimitLabel()}`,
      "FILE_TOO_LARGE",
    );
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    throw badRequest(`File ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`);
  }
  return file;
}

export function validateUploadFiles(options: {
  files?: Express.Multer.File[];
  whitelist?: Express.Multer.File[];
}): void {
  const { files = [], whitelist = [] } = options;

  if (!files || files.length === 0) {
    throw badRequest("At least one image file is required");
  }
  if (files.length > config.BATCH_MAX_FILES) {
    throw badRequest(`Too many files: maximum allowed is ${config.BATCH_MAX_FILES}`);
  }
  if (whitelist.length > MAX_WHITELIST_FILES) {
    throw badRequest("At most 20 allow list faces per batch", "VALIDATION_ERROR");
  }

  for (const file of files) {
    if (file.size > config.IMAGE_UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `File ${file.originalname} exceeds the file size limit of ${uploadLimitLabel()}`,
        "FILE_TOO_LARGE",
      );
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw badRequest(
        `File ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }

  for (const file of whitelist) {
    if (file.size > config.IMAGE_UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `Allow list file ${file.originalname} exceeds the file size limit of ${uploadLimitLabel()}`,
        "FILE_TOO_LARGE",
      );
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw badRequest(
        `Allow list file ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }
}

/**
 * Schema for user-drawn bounding box coordinates in original-image pixels.
 * Coordinates must be finite numbers satisfying x1 < x2 and y1 < y2.
 */
export const addedBoxSchema = z
  .object({
    box: z
      .tuple([z.number(), z.number(), z.number(), z.number()])
      .refine(
        ([x1, y1, x2, y2]) =>
          Number.isFinite(x1) &&
          Number.isFinite(y1) &&
          Number.isFinite(x2) &&
          Number.isFinite(y2) &&
          x1 < x2 &&
          y1 < y2,
        {
          message: "Box coordinates must be finite numbers with x1 < x2 and y1 < y2",
        },
      ),
  })
  .strict();

export type AddedBox = z.infer<typeof addedBoxSchema>;

/**
 * Validation schema for POST /api/jobs/:id/edit request bodies.
 *
 * Why strict schema: Prevents unexpected parameters from altering the render command,
 * while enforcing finite box coordinates, max 50 added boxes, and Contract §2 strength ranges.
 */
export const editJobBodySchema = z
  .object({
    redactIndices: z.array(z.number().int().nonnegative()),
    addedBoxes: z.array(addedBoxSchema).max(50).default([]),
    style: redactionStyleSchema.optional(),
    strength: z.number().int().positive().optional(),
    padding: z.number().min(0).max(0.5).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.style !== undefined && val.strength !== undefined) {
      if (val.style === "blur" && (val.strength < 1 || val.strength > 50)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Strength for blur style must be between 1 and 50",
          path: ["strength"],
        });
      } else if (val.style === "pixelate" && (val.strength < 3 || val.strength > 32)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Strength for pixelate style must be between 3 and 32",
          path: ["strength"],
        });
      }
    }
  });

export type EditJobInput = z.infer<typeof editJobBodySchema>;
