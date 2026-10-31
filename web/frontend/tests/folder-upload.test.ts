import { describe, expect, it } from "vitest";
import {
  selectFolderFiles,
  formatFolderSummary,
  getFolderLimitMessage,
  getSelectionLimitMessage,
  isHiddenOrSystemFile,
  getInferredImageType,
  ensureFileType,
  MAX_BATCH_FILES,
  MAX_FILE_BYTES,
  validateImageFiles,
} from "../src/components/file-selection";

function makeFile(name: string, relativePath: string, type = "", size = 1000): File {
  const file = new File([new Uint8Array(size)], name, { type });
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

  it("skips files over MAX_FILE_BYTES and preserves their names in tooLarge", () => {
    const normal = makeFile("small.jpg", "batch/small.jpg", "image/jpeg", 1024);
    const oversized1 = makeFile("giant1.png", "batch/giant1.png", "image/png", MAX_FILE_BYTES + 1);
    const oversized2 = makeFile("giant2.jpg", "batch/giant2.jpg", "image/jpeg", MAX_FILE_BYTES + 500);

    const result = selectFolderFiles([normal, oversized1, oversized2]);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].name).toBe("small.jpg");
    expect(result.skipped.tooLarge).toHaveLength(2);
    expect(result.skipped.tooLarge.map((f) => f.name)).toEqual(["giant1.png", "giant2.jpg"]);
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

  it("formats summary with <= 5 oversized files", () => {
    const files = [
      makeFile("a.jpg", "photos/a.jpg", "image/jpeg"),
      makeFile("big1.png", "photos/big1.png", "image/png", MAX_FILE_BYTES + 1),
      makeFile("big2.jpg", "photos/big2.jpg", "image/jpeg", MAX_FILE_BYTES + 1),
    ];
    const result = selectFolderFiles(files);
    const summary = formatFolderSummary(result);

    expect(summary).toBe(
      "Folder photos: 1 images selected, 0 skipped (0 unsupported, 0 hidden), 2 too large: big1.png, big2.jpg",
    );
  });

  it("formats summary with > 5 oversized files showing 5 names and +n more", () => {
    const files = [
      makeFile("ok.jpg", "data/ok.jpg", "image/jpeg"),
      ...Array.from({ length: 7 }, (_, i) =>
        makeFile(`large_${i + 1}.png`, `data/large_${i + 1}.png`, "image/png", MAX_FILE_BYTES + 1),
      ),
    ];
    const result = selectFolderFiles(files);
    const summary = formatFolderSummary(result);

    expect(summary).toBe(
      "Folder data: 1 images selected, 0 skipped (0 unsupported, 0 hidden), 7 too large: large_1.png, large_2.png, large_3.png, large_4.png, large_5.png, +2 more",
    );
  });
});

describe("Limit Rules (Acceptance criteria: 100 accepted, 101 rejected whole)", () => {
  it("accepts exactly 100 images from a folder", () => {
    const files = Array.from({ length: MAX_BATCH_FILES }, (_, i) =>
      makeFile(`img_${i}.jpg`, `batch100/img_${i}.jpg`, "image/jpeg"),
    );
    const result = selectFolderFiles(files);

    expect(result.images.length).toBe(100);
    expect(result.images.length <= MAX_BATCH_FILES).toBe(true);
  });

  it("rejects 101 images whole with clear message for folder", () => {
    const count = MAX_BATCH_FILES + 1; // 101
    const files = Array.from({ length: count }, (_, i) =>
      makeFile(`img_${i}.jpg`, `batch101/img_${i}.jpg`, "image/jpeg"),
    );
    const result = selectFolderFiles(files);

    expect(result.images.length).toBe(101);
    expect(result.images.length > MAX_BATCH_FILES).toBe(true);

    const message = getFolderLimitMessage(result.images.length);
    expect(message).toBe(
      "The folder has 101 images; the limit is 100 per batch. Pick a smaller folder or split it.",
    );
  });

  it("rejects 101 images whole with clear message for manual file selection", () => {
    const count = 101;
    const messageInitial = getSelectionLimitMessage(count, 0);
    expect(messageInitial).toBe(
      "The selection has 101 images; the limit is 100 per batch. Pick fewer images.",
    );

    const messageAddition = getSelectionLimitMessage(85, 20);
    expect(messageAddition).toBe(
      "Adding 85 images would exceed the limit of 100 per batch (currently 20).",
    );
  });

  it("validateImageFiles allows up to 100 valid images without error", () => {
    const files = Array.from({ length: 100 }, (_, i) =>
      makeFile(`img_${i}.jpg`, `img_${i}.jpg`, "image/jpeg"),
    );
    const issues = validateImageFiles(files);
    expect(issues).toHaveLength(0);
  });
});
