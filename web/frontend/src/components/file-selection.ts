/**
 * File selection, validation, directory traversal, and MIME normalisation utilities.
 */

/** Maximum reference face photos allowed for biometric whitelist matching in batches. */
export const MAX_WHITELIST_FILES = 20;
/** Maximum reference face photos allowed for creating a single saved allow list. */
export const MAX_FACE_LIST_FILES = 5;
import { getSizeLimitFor, getUploadLimits } from "../upload-limits";
import { formatMegabytes } from "../utils/format";

export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ALLOWED_VIDEO_TYPES = new Set(["video/mp4"]);

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const MEDIA_EXTENSION_TO_MIME: Record<string, string> = {
  ...EXTENSION_TO_MIME,
  ".mp4": "video/mp4",
};

const COMMON_IMAGE_EXTENSIONS: Record<string, string> = {
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".heic": "image/heic",
};

export type FileSelectionIssue = {
  file: File;
  reason: string;
};

export type FolderSelectionResult = {
  images: File[];
  skipped: {
    unsupported: number;
    hidden: number;
    tooLarge: File[];
  };
  folderName: string | null;
};

/**
 * Resolves the relative path or name of a selected file.
 */
export function getFilePath(file: File): string {
  const candidate = file as File & { webkitRelativePath?: string };
  return candidate.webkitRelativePath || file.name;
}

/**
 * Returns a stable unique identifier string for a file based on path, size, and modification timestamp.
 */
export function getFileIdentity(file: File): string {
  return `${getFilePath(file)}:${file.size}:${file.lastModified}`;
}

/**
 * Detects hidden dotfiles or OS metadata files (such as .DS_Store or Thumbs.db).
 */
export function isHiddenOrSystemFile(file: File): boolean {
  const filePath = getFilePath(file);
  const segments = filePath.split(/[/\\]/);
  for (const segment of segments) {
    if (!segment) continue;
    if (segment.startsWith(".")) {
      return true;
    }
    const lower = segment.toLowerCase();
    if (lower === "thumbs.db" || lower === "desktop.ini") {
      return true;
    }
  }
  return false;
}

/**
 * Infers valid image MIME types from file extensions or returns the declared MIME type.
 */
export function getInferredImageType(file: File): string | null {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) {
    return file.type;
  }
  const name = file.name.toLowerCase();
  const lastDot = name.lastIndexOf(".");
  if (lastDot !== -1) {
    const ext = name.slice(lastDot);
    if (ext in EXTENSION_TO_MIME) {
      return EXTENSION_TO_MIME[ext];
    }
  }
  return null;
}

export function getInferredMediaType(file: File): string | null {
  if (ALLOWED_IMAGE_TYPES.has(file.type) || ALLOWED_VIDEO_TYPES.has(file.type)) {
    return file.type;
  }
  const name = file.name.toLowerCase();
  const lastDot = name.lastIndexOf(".");
  if (lastDot !== -1) {
    return MEDIA_EXTENSION_TO_MIME[name.slice(lastDot)] ?? null;
  }
  return null;
}

/**
 * Guarantees a file instance has an explicit MIME type by reconstructing a new File object if needed.
 */
export function ensureFileType(file: File, mimeType: string): File {
  if (file.type === mimeType) {
    return file;
  }
  // The browser File.type property is strictly read-only per DOM File API specifications.
  // When files are read from directory entries, the browser frequently sets file.type to an empty string.
  // We construct a new File wrapper wrapping the identical Blob slices with the deduced MIME type so
  // downstream multipart upload handlers (Multer) recognise the file type without re-reading bytes.
  const candidate = file as File & { webkitRelativePath?: string };
  const newFile = new File([file], file.name, {
    type: mimeType,
    lastModified: file.lastModified,
  });
  if (candidate.webkitRelativePath) {
    Object.defineProperty(newFile, "webkitRelativePath", {
      value: candidate.webkitRelativePath,
      configurable: true,
    });
  }
  return newFile;
}

/**
 * Sets webkitRelativePath property on a File instance.
 */
export function attachRelativePath(file: File, relativePath: string): File {
  Object.defineProperty(file, "webkitRelativePath", {
    value: relativePath,
    configurable: true,
    writable: true,
  });
  return file;
}

/**
 * Returns the common root folder name if all files share one directory prefix.
 */
export function getFolderName(files: File[]): string | null {
  if (!files || files.length === 0) {
    return null;
  }

  let commonTopFolder: string | null = null;

  for (const file of files) {
    const filePath = getFilePath(file);
    const slashIndex = filePath.indexOf("/");
    if (slashIndex <= 0) {
      return null;
    }
    const topFolder = filePath.slice(0, slashIndex);
    if (commonTopFolder === null) {
      commonTopFolder = topFolder;
    } else if (commonTopFolder !== topFolder) {
      return null;
    }
  }

  return commonTopFolder;
}

/** Whether the file is bigger than this deployment's per-file limit (false while the limit is unknown). */
function isOverUploadLimit(file: File): boolean {
  const limit = getSizeLimitFor(file);
  return limit !== null && file.size > limit;
}

/**
 * Computes descriptive reason why a given file is rejected by validation rules.
 */
export function getFileRejectionReason(file: File, isFolder = false): string {
  const customError = (file as unknown as { errorReason?: string }).errorReason;
  if (customError) {
    return customError;
  }

  if (isFolder || (file as { isFolder?: boolean }).isFolder === true) {
    return "is a folder: use Choose folder";
  }

  const limit = getSizeLimitFor(file);
  if (limit !== null && file.size > limit && getInferredMediaType(file)) {
    return `${formatMegabytes(file.size)}, over the ${formatMegabytes(limit)} file size limit`;
  }

  if (
    file.type &&
    (file.type.startsWith("image/") || file.type.startsWith("video/")) &&
    !ALLOWED_IMAGE_TYPES.has(file.type) &&
    !ALLOWED_VIDEO_TYPES.has(file.type)
  ) {
    return `unsupported image type (${file.type})`;
  }

  const name = file.name.toLowerCase();
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot !== -1 && lastDot < name.length - 1 ? name.slice(lastDot) : null;

  if (ext && ext in COMMON_IMAGE_EXTENSIONS) {
    return `unsupported image type (${COMMON_IMAGE_EXTENSIONS[ext]})`;
  }

  if (ext) {
    return `not an image (${ext}); only JPG, PNG and WEBP are accepted`;
  }

  return "not an image (no file extension); only JPG, PNG and WEBP are accepted";
}

/**
 * Formats file path and rejection reason into a single string.
 */
export function formatFileRejection(file: File, isFolder = false): string {
  const path = getFilePath(file);
  const reason = getFileRejectionReason(file, isFolder);
  return `${path} — ${reason}`;
}

/**
 * Formats human-readable count title for file validation errors.
 */
export function formatValidationTitle(count: number): string {
  return `${count} ${count === 1 ? "file was" : "files were"} not added`;
}

/**
 * Validates a list of files against supported MIME types and size constraints.
 */
export function validateImageFiles(files: File[]): FileSelectionIssue[] {
  return files.flatMap((file) => {
    const customError = (file as unknown as { errorReason?: string }).errorReason;
    if (customError) {
      return [{ file, reason: customError }];
    }
    const isFolder = (file as { isFolder?: boolean }).isFolder === true;
    if (isFolder) {
      return [{ file, reason: getFileRejectionReason(file, true) }];
    }
    const mime = getInferredImageType(file);
    if (!mime || isOverUploadLimit(file)) {
      return [{ file, reason: getFileRejectionReason(file, false) }];
    }
    return [];
  });
}

export function validateMediaFiles(files: File[]): FileSelectionIssue[] {
  return files.flatMap((file) => {
    const customError = (file as unknown as { errorReason?: string }).errorReason;
    if (customError) return [{ file, reason: customError }];
    if ((file as { isFolder?: boolean }).isFolder === true) {
      return [{ file, reason: getFileRejectionReason(file, true) }];
    }
    const mime = getInferredMediaType(file);
    if (!mime || isOverUploadLimit(file)) {
      return [{ file, reason: getFileRejectionReason(file) }];
    }
    return [];
  });
}

/**
 * Partitions dropped or picked folder contents into valid images, oversized files, and unsupported items.
 */
export function selectFolderFiles(files: File[]): FolderSelectionResult {
  const images: File[] = [];
  const tooLarge: File[] = [];
  let unsupported = 0;
  let hidden = 0;

  for (const file of files) {
    if (isHiddenOrSystemFile(file)) {
      hidden++;
      continue;
    }

    const mime = getInferredMediaType(file);
    if (!mime) {
      unsupported++;
      continue;
    }

    if (isOverUploadLimit(file)) {
      tooLarge.push(file);
      continue;
    }

    images.push(ensureFileType(file, mime));
  }

  return {
    images,
    skipped: {
      unsupported,
      hidden,
      tooLarge,
    },
    folderName: getFolderName(files),
  };
}

/**
 * Formats a descriptive summary banner text of selected and skipped folder items.
 */
export function formatFolderSummary(result: FolderSelectionResult): string {
  const { images, skipped, folderName } = result;
  const name = folderName ?? "folder";
  const x = images.length;
  const z = skipped.unsupported;
  const w = skipped.hidden;
  const y = z + w;
  const k = skipped.tooLarge.length;

  let text = `Folder ${name}: ${x} images selected, ${y} skipped (${z} unsupported, ${w} hidden)`;
  if (k > 0) {
    const shown = skipped.tooLarge
      .slice(0, 5)
      .map((f) => f.name)
      .join(", ");
    const more = k > 5 ? `, +${k - 5} more` : "";
    const limits = getUploadLimits();
    const label = limits
      ? ` (${formatMegabytes(limits.imageUploadMaxBytes)} for photos, ${formatMegabytes(limits.videoUploadMaxBytes)} for videos)`
      : "";
    text += `, ${k} over the file size limit${label}: ${shown}${more}`;
  }
  return text;
}

/**
 * Sorts the files react-dropzone read from a drop into "one folder" or "anything else".
 *
 * react-dropzone (via file-selector) already walks folders and gives each file a `path`: "/photos/a.jpg" for a file
 * inside a dropped folder "photos", and "/a.jpg" or "./a.jpg" for a loose file. When every file sits under the same
 * single top folder the drop is a folder drop, and each file gets that path as its relative path so the folder name and
 * sub-folders show up in the list. Hidden files inside the folder are kept so the folder summary can count them; hidden
 * files dropped on their own are ignored.
 */
export function readDroppedFiles(dropped: File[]): { folderFiles: File[] | null; otherFiles: File[] } {
  const paths = dropped.map((file) => ((file as File & { path?: string }).path ?? file.name).replace(/^\.?\//, ""));
  const topFolders = new Set(paths.map((path) => (path.includes("/") ? path.split("/")[0] : "")));
  const isOneFolder = dropped.length > 0 && topFolders.size === 1 && !topFolders.has("");

  if (isOneFolder) {
    return { folderFiles: dropped.map((file, index) => attachRelativePath(file, paths[index])), otherFiles: [] };
  }
  return { folderFiles: null, otherFiles: dropped.filter((file) => !isHiddenOrSystemFile(file)) };
}

/**
 * Result of attempting to add incoming reference files to a whitelist.
 */
export interface AddWhitelistFilesResult {
  files: File[];
  issues: FileSelectionIssue[];
}

/**
 * Validates, normalises, deduplicates, and appends reference photos for the face whitelist.
 * Enforces the maximum allowed reference faces (default: MAX_WHITELIST_FILES = 20).
 * Capacity is calculated as nextFiles.length + existingCount < max, ensuring error messages
 * display the total limit max rather than remaining slots.
 * Duplicates are skipped without creating issues; invalid formats or overflows beyond max
 * return descriptive issues.
 */
export function addWhitelistFiles(
  current: File[],
  incoming: File[],
  max = MAX_WHITELIST_FILES,
  existingCount = 0,
): AddWhitelistFilesResult {
  const issues: FileSelectionIssue[] = [];
  const validationIssues = validateImageFiles(incoming);
  const invalidFileSet = new Set(validationIssues.map((issue) => issue.file));

  // Duplicates are identified by path/size/mtime identity matching either current or incoming
  const seenIdentities = new Set(current.map(getFileIdentity));
  const nextFiles = [...current];

  for (const file of incoming) {
    if (invalidFileSet.has(file)) {
      continue;
    }

    const identity = getFileIdentity(file);
    if (seenIdentities.has(identity)) {
      continue;
    }
    seenIdentities.add(identity);

    if (nextFiles.length + existingCount < max) {
      const mime = getInferredImageType(file);
      const normalized = mime ? ensureFileType(file, mime) : file;
      nextFiles.push(normalized);
    } else {
      issues.push({
        file,
        reason: `only ${max} reference files allowed`,
      });
    }
  }

  return {
    files: nextFiles,
    issues: [...validationIssues, ...issues],
  };
}
