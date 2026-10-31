export const MAX_BATCH_FILES = 100;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
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

export function getFilePath(file: File): string {
  const candidate = file as File & { webkitRelativePath?: string };
  return candidate.webkitRelativePath || file.name;
}

export function getFileIdentity(file: File): string {
  return `${getFilePath(file)}:${file.size}:${file.lastModified}`;
}

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

export function ensureFileType(file: File, mimeType: string): File {
  if (file.type === mimeType) {
    return file;
  }
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

export function validateImageFiles(files: File[]): FileSelectionIssue[] {
  return files.flatMap((file) => {
    const mime = getInferredImageType(file);
    if (!mime) {
      return [{ file, reason: "Unsupported format. Use JPG, PNG, or WEBP." }];
    }
    if (file.size > MAX_FILE_BYTES) {
      return [{ file, reason: "File exceeds the 50 MB limit." }];
    }
    return [];
  });
}

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

    const mime = getInferredImageType(file);
    if (!mime) {
      unsupported++;
      continue;
    }

    if (file.size > MAX_FILE_BYTES) {
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
    const shown = skipped.tooLarge.slice(0, 5).map((f) => f.name).join(", ");
    const more = k > 5 ? `, +${k - 5} more` : "";
    text += `, ${k} too large: ${shown}${more}`;
  }
  return text;
}

export function getFolderLimitMessage(imageCount: number): string {
  return `The folder has ${imageCount} images; the limit is ${MAX_BATCH_FILES} per batch. Pick a smaller folder or split it.`;
}

export function getSelectionLimitMessage(incomingCount: number, currentCount = 0): string {
  if (currentCount > 0) {
    return `Adding ${incomingCount} images would exceed the limit of ${MAX_BATCH_FILES} per batch (currently ${currentCount}).`;
  }
  return `The selection has ${incomingCount} images; the limit is ${MAX_BATCH_FILES} per batch. Pick fewer images.`;
}
