/**
 * Input request validation utilities, UUID validators, and batch naming constraints.
 */
import { z } from "zod";
import { config } from "../config";
import { badRequest, notFound, payloadTooLarge } from "../errors";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export function validateIdParam(params: unknown): string {
  return idParamSchema.parse(params).id;
}

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
        code: z.ZodIssueCode.custom,
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

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
        throw notFound("Face list not found");
      }
    }
  }

  if (whitelist.length > MAX_WHITELIST_FILES) {
    throw badRequest("At most 20 whitelist faces per batch", "VALIDATION_ERROR");
  }

  for (const file of whitelist) {
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `Whitelist file ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`,
        "FILE_TOO_LARGE",
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw badRequest(
        `Whitelist file ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }
}

export function validateSingleUploadFile(file?: Express.Multer.File): Express.Multer.File {
  if (!file) {
    throw badRequest("File is required in field 'file'");
  }
  if (file.size > config.UPLOAD_MAX_BYTES) {
    throw payloadTooLarge(
      `File ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`,
      "FILE_TOO_LARGE",
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
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
    throw badRequest("At most 20 whitelist faces per batch", "VALIDATION_ERROR");
  }

  for (const file of files) {
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `File ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`,
        "FILE_TOO_LARGE",
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw badRequest(
        `File ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }

  for (const file of whitelist) {
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `Whitelist file ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`,
        "FILE_TOO_LARGE",
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw badRequest(
        `Whitelist file ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }
}
