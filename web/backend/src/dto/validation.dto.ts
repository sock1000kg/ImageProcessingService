import { z } from "zod";
import { config } from "../config";
import { badRequest, payloadTooLarge } from "../errors";

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export function validateIdParam(params: unknown): string {
  return idParamSchema.parse(params).id;
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

  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `File ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`,
        "FILE_TOO_LARGE",
      );
    }
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw badRequest(
        `File ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }

  for (const file of whitelist) {
    totalBytes += file.size;
    if (file.size > config.UPLOAD_MAX_BYTES) {
      throw payloadTooLarge(
        `Whitelist file ${file.originalname} exceeds limit of ${config.UPLOAD_MAX_BYTES} bytes`,
        "FILE_TOO_LARGE",
      );
    }
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw badRequest(
        `Whitelist file ${file.originalname} has unsupported format. Only JPEG, PNG, and WEBP images are supported`,
      );
    }
  }

  if (totalBytes > config.BATCH_MAX_BYTES) {
    throw payloadTooLarge(
      `Total upload size exceeds ${config.BATCH_MAX_BYTES} bytes`,
      "FILE_TOO_LARGE",
    );
  }
}
