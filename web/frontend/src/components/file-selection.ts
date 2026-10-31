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
  const relativePath = files
    .map(getFilePath)
    .find((filePath) => filePath.includes("/"));
  return relativePath?.split("/")[0] ?? null;
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
