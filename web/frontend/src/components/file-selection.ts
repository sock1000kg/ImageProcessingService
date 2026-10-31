export const MAX_BATCH_FILES = 100;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type FileSelectionIssue = {
  file: File;
  reason: string;
};

export function getFilePath(file: File): string {
  const candidate = file as File & { webkitRelativePath?: string };
  return candidate.webkitRelativePath || file.name;
}

export function getFileIdentity(file: File): string {
  return `${getFilePath(file)}:${file.size}:${file.lastModified}`;
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
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return [{ file, reason: "Unsupported format. Use JPG, PNG, or WEBP." }];
    }
    if (file.size > MAX_FILE_BYTES) {
      return [{ file, reason: "File exceeds the 50 MB limit." }];
    }
    return [];
  });
}
