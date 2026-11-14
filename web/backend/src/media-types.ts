/**
 * Image types the service accepts, and a check of what an uploaded file actually contains.
 */
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import { badRequest } from "./errors";

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const VIDEO_EXT = ".mp4";

export const isVideoFilename = (filename: string): boolean => {
  if (!filename) return false;
  return path.extname(filename).toLowerCase() === VIDEO_EXT;
};

/**
 * Rejects an uploaded image whose content is not really JPEG, PNG or WEBP. The browser's declared MIME type and the
 * file extension are only claims; this reads the file's first bytes (its "magic number") to see what it is, so a
 * renamed PDF or text file fails here instead of costing a worker job. Needs the file in memory (multer's buffer).
 */
export async function assertImageContents(files: Express.Multer.File[], label = "File"): Promise<void> {
  for (const file of files) {
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_IMAGE_MIME_TYPES.includes(detected.mime)) {
      throw badRequest(
        `${label} ${file.originalname} is not a valid image. Only JPEG, PNG, and WEBP images are supported`,
        "INVALID_MEDIA_TYPE",
      );
    }
  }
}
