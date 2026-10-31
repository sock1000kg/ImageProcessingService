import { z } from "zod";
import { config } from "../config";
import { badRequest, payloadTooLarge } from "../errors";

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export function validateIdParam(params: unknown): string {
  return idParamSchema.parse(params).id;
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateBatchCreation(options: {
  filesPresent?: boolean;
  whitelist?: Express.Multer.File[];
}): void {
  const { filesPresent = false, whitelist = [] } = options;

  if (filesPresent) {
    throw badRequest(
      "Field 'files' is not allowed on batch creation. Upload images individually to POST /api/batches/:id/files",
      "INVALID_FIELD",
    );
  }

  if (whitelist.length > 5) {
    throw badRequest("Too many whitelist files: maximum allowed is 5");
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
    throw badRequest(
      `File ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
    );
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
  if (whitelist.length > 5) {
    throw badRequest("Too many whitelist files: maximum allowed is 5");
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
