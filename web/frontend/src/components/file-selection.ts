export const MAX_BATCH_FILES = 100;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
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

export interface WebkitFileEntry {
  isFile: true;
  isDirectory: false;
  name: string;
  file: (successCallback: (file: File) => void, errorCallback?: (error: unknown) => void) => void;
}

export interface WebkitDirectoryReader {
  readEntries: (
    successCallback: (entries: WebkitEntry[]) => void,
    errorCallback?: (error: unknown) => void,
  ) => void;
}

export interface WebkitDirectoryEntry {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader: () => WebkitDirectoryReader;
}

export type WebkitEntry = WebkitFileEntry | WebkitDirectoryEntry;

export type DropKind = "single-folder" | "files-only" | "mixed";

export interface ClassifiedDrop {
  kind: DropKind;
  folderEntry?: WebkitDirectoryEntry;
  fileEntries?: WebkitFileEntry[];
  entries: WebkitEntry[];
}

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

export function attachRelativePath(file: File, relativePath: string): File {
  Object.defineProperty(file, "webkitRelativePath", {
    value: relativePath,
    configurable: true,
    writable: true,
  });
  return file;
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

export function formatFileSizeMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (Math.abs(mb - Math.round(mb)) < 0.05) {
    return `${Math.round(mb)} MB`;
  }
  return `${Number(mb.toFixed(1))} MB`;
}

export function getFileRejectionReason(file: File, isFolder = false): string {
  const customError = (file as unknown as { errorReason?: string }).errorReason;
  if (customError) {
    return customError;
  }

  if (isFolder || (file as { isFolder?: boolean }).isFolder === true) {
    return "is a folder: use Choose folder";
  }

  const mime = getInferredImageType(file);

  if (mime && file.size > MAX_FILE_BYTES) {
    return `${formatFileSizeMb(file.size)}, over the ${formatFileSizeMb(MAX_FILE_BYTES)} limit`;
  }

  if (file.type && file.type.startsWith("image/") && !ALLOWED_IMAGE_TYPES.has(file.type)) {
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

export function formatFileRejection(file: File, isFolder = false): string {
  const path = getFilePath(file);
  const reason = getFileRejectionReason(file, isFolder);
  return `${path} — ${reason}`;
}

export function formatValidationTitle(count: number): string {
  return `${count} ${count === 1 ? "file was" : "files were"} not added`;
}

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
    if (!mime) {
      return [{ file, reason: getFileRejectionReason(file, false) }];
    }
    if (file.size > MAX_FILE_BYTES) {
      return [{ file, reason: getFileRejectionReason(file, false) }];
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
  const maxMb = Math.round(MAX_FILE_BYTES / (1024 * 1024));

  let text = `Folder ${name}: ${x} images selected, ${y} skipped (${z} unsupported, ${w} hidden)`;
  if (k > 0) {
    const shown = skipped.tooLarge.slice(0, 5).map((f) => f.name).join(", ");
    const more = k > 5 ? `, +${k - 5} more` : "";
    text += `, ${k} over the ${maxMb} MB limit: ${shown}${more}`;
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

export async function isFolderFile(file: File): Promise<boolean> {
  if ((file as { isFolder?: boolean }).isFolder === true) {
    return true;
  }
  if (file.type !== "") {
    return false;
  }
  if (typeof file.slice === "function") {
    try {
      const slice = file.slice(0, 1);
      if (typeof slice.arrayBuffer === "function") {
        await slice.arrayBuffer();
        return false;
      }
    } catch {
      return true;
    }
  }
  return false;
}

export async function readFileEntry(entry: WebkitFileEntry): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

export async function readDirectoryEntries(dirEntry: WebkitDirectoryEntry): Promise<WebkitEntry[]> {
  const reader = dirEntry.createReader();
  const allEntries: WebkitEntry[] = [];
  while (true) {
    const batch = await new Promise<WebkitEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch || batch.length === 0) {
      break;
    }
    allEntries.push(...batch);
  }
  return allEntries;
}

export async function walkDirectory(dirEntry: WebkitDirectoryEntry, parentPath = dirEntry.name): Promise<File[]> {
  const entries = await readDirectoryEntries(dirEntry);
  const files: File[] = [];

  for (const entry of entries) {
    const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      try {
        const subFiles = await walkDirectory(entry, entryPath);
        files.push(...subFiles);
      } catch (err) {
        const errFile = new File([], entry.name, { type: "" });
        attachRelativePath(errFile, entryPath);
        Object.defineProperty(errFile, "errorReason", {
          value: `Could not read folder: ${err instanceof Error ? err.message : "error"}`,
          configurable: true,
        });
        files.push(errFile);
      }
    } else if (entry.isFile && typeof entry.file === "function") {
      try {
        const file = await readFileEntry(entry);
        attachRelativePath(file, entryPath);
        files.push(file);
      } catch (err) {
        const errFile = new File([], entry.name, { type: "" });
        attachRelativePath(errFile, entryPath);
        Object.defineProperty(errFile, "errorReason", {
          value: `Could not read file: ${err instanceof Error ? err.message : "error"}`,
          configurable: true,
        });
        files.push(errFile);
      }
    }
  }

  return files;
}

export async function walkEntries(entries: WebkitEntry[]): Promise<File[]> {
  const files: File[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const subFiles = await walkDirectory(entry, entry.name);
      files.push(...subFiles);
    } else if (entry.isFile && typeof entry.file === "function") {
      const file = await readFileEntry(entry);
      files.push(file);
    }
  }
  return files;
}

export function classifyDrop(entries: WebkitEntry[]): ClassifiedDrop {
  if (entries.length === 1 && entries[0].isDirectory) {
    return {
      kind: "single-folder",
      folderEntry: entries[0] as WebkitDirectoryEntry,
      entries,
    };
  }
  if (entries.length > 0 && entries.every((e) => e.isFile)) {
    return {
      kind: "files-only",
      fileEntries: entries as WebkitFileEntry[],
      entries,
    };
  }
  return {
    kind: "mixed",
    entries,
  };
}
