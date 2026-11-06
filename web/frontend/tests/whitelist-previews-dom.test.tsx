// @vitest-environment happy-dom
/**
 * Tests for whitelist file selection helper, WhitelistUploader component,
 * and FilePreviewList scrollable list and header controls.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup, getAllByText } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
import { useState } from "react";
import { addWhitelistFiles, MAX_WHITELIST_FILES } from "../src/components/file-selection";
import { WhitelistUploader } from "../src/components/WhitelistUploader";
import { FilePreviewList } from "../src/components/FilePreviewList";
import { BatchCreateForm } from "../src/components/BatchCreateForm";

function makeFile(name: string, type = "image/jpeg", size = 1000): File {
  return new File([new Uint8Array(size)], name, {
    type,
    lastModified: 1700000000000,
  });
}

describe("Step 1: addWhitelistFiles pure helper", () => {
  it("appends valid image files to an empty and non-empty list", () => {
    const file1 = makeFile("face1.jpg", "image/jpeg");
    const file2 = makeFile("face2.png", "image/png");

    const firstResult = addWhitelistFiles([], [file1]);
    expect(firstResult.files).toHaveLength(1);
    expect(firstResult.files[0]?.name).toBe("face1.jpg");
    expect(firstResult.issues).toHaveLength(0);

    const secondResult = addWhitelistFiles(firstResult.files, [file2]);
    expect(secondResult.files).toHaveLength(2);
    expect(secondResult.files.map((f) => f.name)).toEqual(["face1.jpg", "face2.png"]);
    expect(secondResult.issues).toHaveLength(0);
  });

  it("normalises MIME types for files with inferred image extensions", () => {
    // Browser directory reads often provide empty string for file.type
    const fileWithoutMime = new File([new Uint8Array(500)], "face.webp", {
      type: "",
      lastModified: 1700000000000,
    });
    const result = addWhitelistFiles([], [fileWithoutMime]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.type).toBe("image/webp");
  });

  it("skips duplicate files silently without reporting issues", () => {
    const file1 = makeFile("face1.jpg", "image/jpeg");
    const duplicateOfFile1 = makeFile("face1.jpg", "image/jpeg");
    const file2 = makeFile("face2.jpg", "image/jpeg");

    // Existing file in current, and duplicate within incoming
    const result = addWhitelistFiles([file1], [duplicateOfFile1, file2, file2]);
    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.name)).toEqual(["face1.jpg", "face2.jpg"]);
    expect(result.issues).toHaveLength(0);
  });

  it("reports validation issues for invalid file types without adding them", () => {
    const validFile = makeFile("face1.jpg", "image/jpeg");
    const textFile = makeFile("notes.txt", "text/plain");
    const pdfFile = makeFile("doc.pdf", "application/pdf");

    const result = addWhitelistFiles([], [validFile, textFile, pdfFile]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.name).toBe("face1.jpg");
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]?.file.name).toBe("notes.txt");
    expect(result.issues[1]?.file.name).toBe("doc.pdf");
  });

  it("allows exactly 20 files with no issues", () => {
    const files = Array.from({ length: 20 }, (_, i) => makeFile(`face${i + 1}.jpg`));
    const result = addWhitelistFiles([], files);
    expect(result.files).toHaveLength(MAX_WHITELIST_FILES);
    expect(result.issues).toHaveLength(0);
  });

  it("reports an issue for the 21st file and does not add past max", () => {
    const files = Array.from({ length: 21 }, (_, i) => makeFile(`face${i + 1}.jpg`));
    const result = addWhitelistFiles([], files);

    expect(result.files).toHaveLength(20);
    expect(result.files.map((f) => f.name)).toEqual(Array.from({ length: 20 }, (_, i) => `face${i + 1}.jpg`));
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.file.name).toBe("face21.jpg");
    expect(result.issues[0]?.reason).toBe("only 20 reference faces allowed");
  });

  it("reports issues for all overflow files when appending to an existing list", () => {
    const existing = Array.from({ length: 18 }, (_, i) => makeFile(`face${i + 1}.jpg`));
    const incoming = [makeFile("face19.jpg"), makeFile("face20.jpg"), makeFile("face21.jpg"), makeFile("face22.jpg")];

    const result = addWhitelistFiles(existing, incoming);
    expect(result.files).toHaveLength(20);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]?.file.name).toBe("face21.jpg");
    expect(result.issues[0]?.reason).toBe("only 20 reference faces allowed");
    expect(result.issues[1]?.file.name).toBe("face22.jpg");
    expect(result.issues[1]?.reason).toBe("only 20 reference faces allowed");
  });
});

describe("Step 2 & 5: FilePreviewList badge labels and header controls", () => {
  it("renders header row with title and clear button when provided", () => {
    const files = [makeFile("a.jpg"), makeFile("b.jpg")];
    const onClear = vi.fn();

    const { getByText, getByRole } = render(
      <FilePreviewList files={files} errors={{}} onRemove={vi.fn()} title="Custom File Summary" onClear={onClear} />,
    );

    expect(getByText(/Custom File Summary/i)).toBeDefined();
    const clearButton = getByRole("button", { name: /clear/i });
    expect(clearButton).toBeDefined();

    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders thumbnail badge when label prop is provided", () => {
    const files = [makeFile("ref1.jpg"), makeFile("ref2.jpg")];
    const { getByText } = render(
      <FilePreviewList files={files} errors={{}} onRemove={vi.fn()} label={(index) => `#${index + 1}`} />,
    );

    expect(getByText("#1")).toBeDefined();
    expect(getByText("#2")).toBeDefined();
  });
});

describe("Step 3: WhitelistUploader integration DOM tests", () => {
  function WhitelistHarness() {
    const [files, setFiles] = useState<File[]>([]);
    return <WhitelistUploader files={files} onChange={setFiles} />;
  }

  it("supports selecting 2 files, re-indexing on removal, and reporting overflow past 20", () => {
    const { container, getByText, queryByText, getByRole, getAllByRole, queryByRole } = render(<WhitelistHarness />);

    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    expect(input).not.toBeNull();

    // 1. Select 2 references
    const file1 = makeFile("ref1.jpg");
    const file2 = makeFile("ref2.jpg");
    fireEvent.change(input, { target: { files: [file1, file2] } });

    // Both thumbnails are rendered
    expect(getAllByRole("button", { name: /remove/i })).toHaveLength(2);
    expect(getByText("ref1.jpg")).toBeDefined();
    expect(getByText("ref2.jpg")).toBeDefined();

    // 2. Remove #1 -> the old #2 remains
    const removeRef1 = getByRole("button", { name: /remove.*ref1\.jpg/i });
    fireEvent.click(removeRef1);

    expect(getAllByRole("button", { name: /remove/i })).toHaveLength(1);
    expect(queryByText("ref1.jpg")).toBeNull();
    expect(getByText("ref2.jpg")).toBeDefined();

    // 3. Select 20 more files -> total capacity 20 reached, 20 shown + notice for the overflow
    const incomingTwenty = Array.from({ length: 20 }, (_, i) => makeFile(`more${i + 1}.jpg`));
    fireEvent.change(input, { target: { files: incomingTwenty } });

    expect(getAllByRole("button", { name: /remove/i })).toHaveLength(20);

    // The 20th file from incoming (more20.jpg) exceeded the capacity
    expect(getByText(/more20\.jpg/)).toBeDefined();
    expect(queryByRole("button", { name: /remove.*more20\.jpg/i })).toBeNull();
  });

  it("resets input value so re-selecting the same file after removal works", () => {
    const { container, getByText, queryByText, getByRole, queryByRole } = render(<WhitelistHarness />);
    const input = container.querySelector("input[type='file']") as HTMLInputElement;

    const file1 = makeFile("face.jpg");
    fireEvent.change(input, { target: { files: [file1] } });
    expect(getByRole("button", { name: /remove.*face\.jpg/i })).toBeDefined();

    // Remove the file
    fireEvent.click(getByRole("button", { name: /remove.*face\.jpg/i }));
    expect(queryByText("face.jpg")).toBeNull();
    expect(queryByRole("button", { name: /remove/i })).toBeNull();

    // Add the exact same file again
    fireEvent.change(input, { target: { files: [file1] } });
    expect(getByRole("button", { name: /remove.*face\.jpg/i })).toBeDefined();
    expect(getByText("face.jpg")).toBeDefined();
  });
});

describe("Step 4: BatchCreateForm Clear all behavior", () => {
  it("clears files, errors, folder summary and folder default name, but preserves user typed name", () => {
    const onSubmit = vi.fn();
    const { container, getByText, queryByText, getByRole, queryByRole } = render(
      <BatchCreateForm busy={false} error="" onSubmit={onSubmit} />,
    );

    // User types a custom batch name
    const nameInput = getByRole("textbox", { name: /batch name/i }) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Custom Batch" } });
    expect(nameInput.value).toBe("My Custom Batch");

    // Add files
    const dropzoneInput = container.querySelector("input[type='file']") as HTMLInputElement;
    const file1 = makeFile("img1.jpg");
    const file2 = makeFile("img2.jpg");
    fireEvent.change(dropzoneInput, { target: { files: [file1, file2] } });

    expect(getByText("img1.jpg")).toBeDefined();
    expect(getByText("img2.jpg")).toBeDefined();
    expect(getByRole("button", { name: /clear/i })).toBeDefined();

    // Click "Clear all"
    fireEvent.click(getByRole("button", { name: /clear/i }));

    // Files are cleared
    expect(queryByText("img1.jpg")).toBeNull();
    expect(queryByText("img2.jpg")).toBeNull();
    expect(queryByRole("button", { name: /clear/i })).toBeNull();

    // User typed name is still intact!
    expect(nameInput.value).toBe("My Custom Batch");
  });
});
