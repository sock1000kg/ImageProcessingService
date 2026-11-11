import { describe, expect, it } from "vitest";
import {
  selectFolderFiles,
  formatFolderSummary,
  isHiddenOrSystemFile,
  getInferredImageType,
  ensureFileType,
  validateImageFiles,
  getFileRejectionReason,
  formatFileRejection,
  formatValidationTitle,
  readDroppedFiles,
} from "../src/components/file-selection";

function makeFile(name: string, relativePath: string, type = "", size = 1000): File {
  const content = size > 4096 ? [] : [new Uint8Array(size)];
  const file = new File(content, name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  Object.defineProperty(file, "webkitRelativePath", {
    value: relativePath,
    configurable: true,
    writable: true,
  });
  return file;
}

describe("Folder Upload - selectFolderFiles and helper logic", () => {
  it("keeps JPG, PNG, and WEBP while skipping unsupported formats", () => {
    const files = [
      makeFile("photo1.jpg", "holiday/photo1.jpg", "image/jpeg"),
      makeFile("photo2.png", "holiday/photo2.png", "image/png"),
      makeFile("photo3.webp", "holiday/photo3.webp", "image/webp"),
      makeFile("notes.txt", "holiday/notes.txt", "text/plain"),
      makeFile("doc.pdf", "holiday/doc.pdf", "application/pdf"),
      makeFile("animation.gif", "holiday/animation.gif", "image/gif"),
    ];

    const result = selectFolderFiles(files);

    expect(result.images).toHaveLength(3);
    expect(result.images.map((f) => f.name)).toEqual(["photo1.jpg", "photo2.png", "photo3.webp"]);
    expect(result.skipped.unsupported).toBe(3);
    expect(result.skipped.hidden).toBe(0);
    expect(result.skipped.tooLarge).toHaveLength(0);
    expect(result.folderName).toBe("holiday");
  });

  it("handles empty file.type with valid extension (.jpg, .jpeg, .png, .webp, case-insensitive)", () => {
    const files = [
      makeFile("upper.JPG", "my-folder/upper.JPG", ""),
      makeFile("jpeg_ext.jpeg", "my-folder/jpeg_ext.jpeg", ""),
      makeFile("mixed.PnG", "my-folder/mixed.PnG", ""),
      makeFile("modern.WebP", "my-folder/modern.WebP", ""),
      makeFile("binary.bin", "my-folder/binary.bin", ""),
    ];

    const result = selectFolderFiles(files);

    expect(result.images).toHaveLength(4);
    expect(result.images.map((f) => f.name)).toEqual(["upper.JPG", "jpeg_ext.jpeg", "mixed.PnG", "modern.WebP"]);
    expect(result.images[0].type).toBe("image/jpeg");
    expect(result.images[1].type).toBe("image/jpeg");
    expect(result.images[2].type).toBe("image/png");
    expect(result.images[3].type).toBe("image/webp");
    expect(result.skipped.unsupported).toBe(1);
  });

  it("preserves proper blob type in FormData when file.type was originally empty", () => {
    const emptyTypeFile = makeFile("photo.jpg", "vacation/sub/photo.jpg", "");
    expect(emptyTypeFile.type).toBe("");

    const result = selectFolderFiles([emptyTypeFile]);
    expect(result.images).toHaveLength(1);

    const processed = result.images[0];
    expect(processed.type).toBe("image/jpeg");

    const fd = new FormData();
    fd.append("file", processed);

    const retrieved = fd.get("file") as File;
    expect(retrieved).toBeDefined();
    expect(retrieved.type).toBe("image/jpeg");
    const candidate = retrieved as File & { webkitRelativePath?: string };
    expect(candidate.webkitRelativePath).toBe("vacation/sub/photo.jpg");
  });

  it("ensureFileType returns a new File and does not mutate the original file", () => {
    const original = makeFile("test.png", "folder/test.png", "");
    expect(original.type).toBe("");

    const ensured = ensureFileType(original, "image/png");
    expect(ensured).not.toBe(original);
    expect(ensured.type).toBe("image/png");
    expect(original.type).toBe("");

    const candidate = ensured as File & { webkitRelativePath?: string };
    expect(candidate.webkitRelativePath).toBe("folder/test.png");
  });

  it("validateImageFiles validates without mutating files", () => {
    const file = makeFile("photo.jpg", "folder/photo.jpg", "");
    expect(file.type).toBe("");

    const issues = validateImageFiles([file]);
    expect(issues).toHaveLength(0);
    // Must not mutate
    expect(file.type).toBe("");
  });

  it("skips hidden and system files (starting with ., Thumbs.db, desktop.ini) without reporting as errors", () => {
    const files = [
      makeFile(".DS_Store", "trip/.DS_Store", ""),
      makeFile("Thumbs.db", "trip/Thumbs.db", ""),
      makeFile("thumbs.db", "trip/thumbs.db", ""),
      makeFile("desktop.ini", "trip/desktop.ini", ""),
      makeFile("Desktop.ini", "trip/Desktop.ini", ""),
      makeFile("config", "trip/.git/config", ""),
      makeFile("secret.jpg", "trip/.hidden/secret.jpg", "image/jpeg"),
      makeFile(".hidden_photo.jpg", "trip/.hidden_photo.jpg", "image/jpeg"),
      makeFile("valid.jpg", "trip/valid.jpg", "image/jpeg"),
    ];

    const result = selectFolderFiles(files);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].name).toBe("valid.jpg");
    expect(result.skipped.hidden).toBe(8);
    expect(result.skipped.unsupported).toBe(0);
  });

  it("preserves nested subfolders and their relative paths", () => {
    const files = [
      makeFile("root.png", "album/root.png", "image/png"),
      makeFile("sub1.jpg", "album/day1/sub1.jpg", "image/jpeg"),
      makeFile("sub2.webp", "album/day1/morning/sub2.webp", "image/webp"),
    ];

    const result = selectFolderFiles(files);

    expect(result.images).toHaveLength(3);
    const candidate0 = result.images[0] as File & { webkitRelativePath?: string };
    const candidate1 = result.images[1] as File & { webkitRelativePath?: string };
    const candidate2 = result.images[2] as File & { webkitRelativePath?: string };

    expect(candidate0.webkitRelativePath).toBe("album/root.png");
    expect(candidate1.webkitRelativePath).toBe("album/day1/sub1.jpg");
    expect(candidate2.webkitRelativePath).toBe("album/day1/morning/sub2.webp");
    expect(result.folderName).toBe("album");
  });

  it("keeps oversized files for backend-side deployment limit validation", () => {
    const normal = makeFile("small.jpg", "batch/small.jpg", "image/jpeg", 1024);
    const oversized1 = makeFile("giant1.png", "batch/giant1.png", "image/png", 63 * 1024 * 1024);
    const oversized2 = makeFile("giant2.jpg", "batch/giant2.jpg", "image/jpeg", 64 * 1024 * 1024);

    const result = selectFolderFiles([normal, oversized1, oversized2]);

    expect(result.images).toHaveLength(3);
    expect(result.skipped.tooLarge).toHaveLength(0);
  });

  it("extracts folder name from webkitRelativePath", () => {
    const files = [
      makeFile("img1.jpg", "my-vacation-2026/img1.jpg", "image/jpeg"),
      makeFile("img2.png", "my-vacation-2026/sub/img2.png", "image/png"),
    ];
    const result = selectFolderFiles(files);
    expect(result.folderName).toBe("my-vacation-2026");
  });
});

describe("Folder Summary formatting (formatFolderSummary)", () => {
  it("formats summary when no files are oversized", () => {
    const files = [
      makeFile("photo1.jpg", "vacation/photo1.jpg", "image/jpeg"),
      makeFile("photo2.png", "vacation/photo2.png", "image/png"),
      makeFile("notes.txt", "vacation/notes.txt", "text/plain"),
      makeFile(".DS_Store", "vacation/.DS_Store", ""),
    ];
    const result = selectFolderFiles(files);
    const summary = formatFolderSummary(result);

    // X=2, Y=2 (Z=1 unsupported, W=1 hidden), K=0
    expect(summary).toBe("Folder vacation: 2 images selected, 2 skipped (1 unsupported, 1 hidden)");
  });

  it("does not display a client-side size limit", () => {
    const files = [
      makeFile("a.jpg", "photos/a.jpg", "image/jpeg"),
      makeFile("big1.png", "photos/big1.png", "image/png", 63 * 1024 * 1024),
      makeFile("big2.jpg", "photos/big2.jpg", "image/jpeg", 63 * 1024 * 1024),
    ];
    const result = selectFolderFiles(files);
    const summary = formatFolderSummary(result);

    expect(summary).toBe("Folder photos: 3 images selected, 0 skipped (0 unsupported, 0 hidden)");
  });

  it("does not truncate large files before the backend validates them", () => {
    const files = [
      makeFile("ok.jpg", "data/ok.jpg", "image/jpeg"),
      ...Array.from({ length: 7 }, (_, i) =>
        makeFile(`large_${i + 1}.png`, `data/large_${i + 1}.png`, "image/png", 63 * 1024 * 1024),
      ),
    ];
    const result = selectFolderFiles(files);
    const summary = formatFolderSummary(result);

    expect(summary).toBe("Folder data: 8 images selected, 0 skipped (0 unsupported, 0 hidden)");
  });
});

describe("Folder selection with large batches (>100 accepted)", () => {
  it("accepts more than 100 images from a folder", () => {
    const files = Array.from({ length: 150 }, (_, i) =>
      makeFile(`img_${i}.jpg`, `batch150/img_${i}.jpg`, "image/jpeg"),
    );
    const result = selectFolderFiles(files);

    expect(result.images.length).toBe(150);
  });

  it("validateImageFiles allows more than 100 valid images without error", () => {
    const files = Array.from({ length: 150 }, (_, i) => makeFile(`img_${i}.jpg`, `img_${i}.jpg`, "image/jpeg"));
    const issues = validateImageFiles(files);
    expect(issues).toHaveLength(0);
  });
});

describe("Step 2 & 4: Rejection reason builder", () => {
  it("formats non-image file (.txt) with accepted formats", () => {
    const file = makeFile("notes.txt", "notes.txt", "text/plain");
    const reason = getFileRejectionReason(file);
    expect(reason).toBe("not an image (.txt); only JPG, PNG and WEBP are accepted");
    expect(formatFileRejection(file)).toBe("notes.txt — not an image (.txt); only JPG, PNG and WEBP are accepted");
  });

  it("formats relative path correctly in formatFileRejection", () => {
    const file = makeFile("notes.txt", "holiday/sub/notes.txt", "text/plain");
    expect(formatFileRejection(file)).toBe(
      "holiday/sub/notes.txt — not an image (.txt); only JPG, PNG and WEBP are accepted",
    );
  });

  it("formats unsupported image type (image/tiff)", () => {
    const fileWithMime = makeFile("scan.tiff", "scan.tiff", "image/tiff");
    expect(getFileRejectionReason(fileWithMime)).toBe("unsupported image type (image/tiff)");
    expect(formatFileRejection(fileWithMime)).toBe("scan.tiff — unsupported image type (image/tiff)");

    const fileWithoutMime = makeFile("scan.tiff", "scan.tiff", "");
    expect(getFileRejectionReason(fileWithoutMime)).toBe("unsupported image type (image/tiff)");
  });

  it("does not reject a supported file based on a client-side size limit", () => {
    const size63Mb = 63 * 1024 * 1024;
    const file = makeFile("big.jpg", "big.jpg", "image/jpeg", size63Mb);
    expect(getFileRejectionReason(file)).toBe("not an image (.jpg); only JPG, PNG and WEBP are accepted");
    expect(formatFileRejection(file)).toBe("big.jpg — not an image (.jpg); only JPG, PNG and WEBP are accepted");
  });

  it("formats dropped folder as 'is a folder: use Choose folder'", () => {
    const folderFile = makeFile("images", "images", "", 4096);
    expect(getFileRejectionReason(folderFile, true)).toBe("is a folder: use Choose folder");
    expect(formatFileRejection(folderFile, true)).toBe("images — is a folder: use Choose folder");

    // Also with isFolder property on file
    Object.defineProperty(folderFile, "isFolder", { value: true, configurable: true });
    expect(getFileRejectionReason(folderFile)).toBe("is a folder: use Choose folder");
    expect(formatFileRejection(folderFile)).toBe("images — is a folder: use Choose folder");
  });

  it("formats file with no extension and no type", () => {
    const noExt = makeFile("unknown_file", "unknown_file", "");
    expect(getFileRejectionReason(noExt)).toBe("not an image (no file extension); only JPG, PNG and WEBP are accepted");
    expect(formatFileRejection(noExt)).toBe(
      "unknown_file — not an image (no file extension); only JPG, PNG and WEBP are accepted",
    );
  });

  it("formats validation summary title with correct singular/plural", () => {
    expect(formatValidationTitle(1)).toBe("1 file was not added");
    expect(formatValidationTitle(2)).toBe("2 files were not added");
    expect(formatValidationTitle(10)).toBe("10 files were not added");
  });
});

describe("readDroppedFiles", () => {
  function dropped(name: string, path: string): File {
    const file = new File([new Uint8Array(10)], name, { type: "image/jpeg" });
    Object.defineProperty(file, "path", { value: path, configurable: true });
    return file;
  }

  it("treats files that share one top folder as a folder drop and gives them relative paths", () => {
    const result = readDroppedFiles([dropped("a.jpg", "/trip/a.jpg"), dropped("b.jpg", "/trip/day2/b.jpg")]);

    expect(
      result.folderFiles?.map((file) => (file as File & { webkitRelativePath: string }).webkitRelativePath),
    ).toEqual(["trip/a.jpg", "trip/day2/b.jpg"]);
    expect(result.otherFiles).toEqual([]);
  });

  it("keeps hidden files inside a dropped folder so the folder summary can count them", () => {
    const result = readDroppedFiles([dropped("a.jpg", "/trip/a.jpg"), dropped(".hidden", "/trip/.hidden")]);

    expect(result.folderFiles).toHaveLength(2);
  });

  it("treats loose files as a plain drop and ignores hidden ones", () => {
    const result = readDroppedFiles([dropped("a.jpg", "/a.jpg"), dropped(".secret", "./.secret")]);

    expect(result.folderFiles).toBeNull();
    expect(result.otherFiles.map((file) => file.name)).toEqual(["a.jpg"]);
  });

  it("treats two folders, or a folder plus a loose file, as a plain drop", () => {
    const twoFolders = readDroppedFiles([dropped("a.jpg", "/one/a.jpg"), dropped("b.jpg", "/two/b.jpg")]);
    const mixed = readDroppedFiles([dropped("a.jpg", "/one/a.jpg"), dropped("b.jpg", "/b.jpg")]);

    expect(twoFolders.folderFiles).toBeNull();
    expect(mixed.folderFiles).toBeNull();
  });
});
