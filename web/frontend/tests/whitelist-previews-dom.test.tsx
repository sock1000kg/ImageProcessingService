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

  it("allows exactly 5 files with no issues", () => {
    const files = Array.from({ length: 5 }, (_, i) => makeFile(`face${i + 1}.jpg`));
    const result = addWhitelistFiles([], files);
    expect(result.files).toHaveLength(MAX_WHITELIST_FILES);
    expect(result.issues).toHaveLength(0);
  });

  it("reports an issue for the 6th file and does not add past max", () => {
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`face${i + 1}.jpg`));
    const result = addWhitelistFiles([], files);

    expect(result.files).toHaveLength(5);
    expect(result.files.map((f) => f.name)).toEqual(["face1.jpg", "face2.jpg", "face3.jpg", "face4.jpg", "face5.jpg"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.file.name).toBe("face6.jpg");
    expect(result.issues[0]?.reason).toBe("only 5 reference faces allowed");
  });

  it("reports issues for all overflow files when appending to an existing list", () => {
    const existing = [makeFile("face1.jpg"), makeFile("face2.jpg"), makeFile("face3.jpg")];
    const incoming = [makeFile("face4.jpg"), makeFile("face5.jpg"), makeFile("face6.jpg"), makeFile("face7.jpg")];

    const result = addWhitelistFiles(existing, incoming);
    expect(result.files).toHaveLength(5);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]?.file.name).toBe("face6.jpg");
    expect(result.issues[0]?.reason).toBe("only 5 reference faces allowed");
    expect(result.issues[1]?.file.name).toBe("face7.jpg");
    expect(result.issues[1]?.reason).toBe("only 5 reference faces allowed");
  });
});

describe("Step 2 & 5: FilePreviewList scrollable class, badge labels, and header", () => {
  it("renders with generic .scroll-list class", () => {
    const file = makeFile("photo.jpg");
    const { container } = render(<FilePreviewList files={[file]} errors={{}} onRemove={vi.fn()} />);

    const scrollList = container.querySelector(".scroll-list");
    expect(scrollList).not.toBeNull();
    expect(scrollList?.classList.contains("file-list")).toBe(true);
  });

  it("renders header row with title and 'Clear all' button when provided", () => {
    const files = [makeFile("a.jpg"), makeFile("b.jpg")];
    const onClear = vi.fn();

    const { getByText, container } = render(
      <FilePreviewList files={files} errors={{}} onRemove={vi.fn()} title="2 images selected" onClear={onClear} />,
    );

    const header = container.querySelector(".file-list-header");
    expect(header).not.toBeNull();
    expect(getByText("2 images selected")).toBeDefined();
    expect(getByText("Clear all")).toBeDefined();

    const clearButton = getByText("Clear all");
    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders thumbnail badge when label prop is provided", () => {
    const files = [makeFile("ref1.jpg"), makeFile("ref2.jpg")];
    const { getByText, container } = render(
      <FilePreviewList files={files} errors={{}} onRemove={vi.fn()} label={(index) => `#${index + 1}`} />,
    );

    expect(getByText("#1")).toBeDefined();
    expect(getByText("#2")).toBeDefined();
    const badges = container.querySelectorAll(".thumbnail-badge");
    expect(badges).toHaveLength(2);
  });
});

describe("Step 3: WhitelistUploader integration DOM tests", () => {
  function WhitelistHarness() {
    const [files, setFiles] = useState<File[]>([]);
    return <WhitelistUploader files={files} onChange={setFiles} />;
  }

  it("supports selecting 2 files, re-indexing on removal, and reporting overflow on 5 more", () => {
    const { container, getByText, queryByText, getByLabelText } = render(<WhitelistHarness />);

    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    expect(input).not.toBeNull();

    // 1. Select 2 references
    const file1 = makeFile("ref1.jpg");
    const file2 = makeFile("ref2.jpg");
    fireEvent.change(input, { target: { files: [file1, file2] } });

    // Both thumbnails with #1 and #2 badges are rendered
    expect(getByText("2/5 selected")).toBeDefined();
    expect(getByText("#1")).toBeDefined();
    expect(getByText("#2")).toBeDefined();
    expect(getByText("ref1.jpg")).toBeDefined();
    expect(getByText("ref2.jpg")).toBeDefined();

    // 2. Remove #1 -> the old #2 becomes #1
    const removeRef1 = getByLabelText("Remove ref1.jpg");
    fireEvent.click(removeRef1);

    expect(getByText("1/5 selected")).toBeDefined();
    expect(queryByText("ref1.jpg")).toBeNull();
    expect(getByText("ref2.jpg")).toBeDefined();
    // ref2 now has badge #1
    expect(getByText("#1")).toBeDefined();
    expect(queryByText("#2")).toBeNull();

    // 3. Select 5 more files -> total capacity 5 reached, 5 shown + notice for the overflow
    const incomingFive = Array.from({ length: 5 }, (_, i) => makeFile(`more${i + 1}.jpg`));
    fireEvent.change(input, { target: { files: incomingFive } });

    expect(getByText("5/5 selected")).toBeDefined();
    expect(getByText("#1")).toBeDefined();
    expect(getByText("#2")).toBeDefined();
    expect(getByText("#3")).toBeDefined();
    expect(getByText("#4")).toBeDefined();
    expect(getByText("#5")).toBeDefined();

    // The 5th file from incoming (more5.jpg) exceeded the capacity
    expect(getByText("1 file was not added")).toBeDefined();
    expect(getByText(/more5\.jpg/)).toBeDefined();
    expect(getByText(/only 5 reference faces allowed/)).toBeDefined();
  });

  it("resets input value so re-selecting the same file after removal works", () => {
    const { container, getByText, queryByText, getByLabelText } = render(<WhitelistHarness />);
    const input = container.querySelector("input[type='file']") as HTMLInputElement;

    const file1 = makeFile("face.jpg");
    fireEvent.change(input, { target: { files: [file1] } });
    expect(getByText("1/5 selected")).toBeDefined();

    // Remove the file
    fireEvent.click(getByLabelText("Remove face.jpg"));
    expect(queryByText("face.jpg")).toBeNull();
    expect(queryByText("1/5 selected")).toBeNull();

    // Add the exact same file again
    fireEvent.change(input, { target: { files: [file1] } });
    expect(getByText("1/5 selected")).toBeDefined();
    expect(getByText("face.jpg")).toBeDefined();
  });
});

describe("Step 4: BatchCreateForm Clear all behavior", () => {
  it("clears files, errors, folder summary and folder default name, but preserves user typed name", () => {
    const onSubmit = vi.fn();
    const { container, getByText, queryByText, getAllByText } = render(
      <BatchCreateForm busy={false} error="" onSubmit={onSubmit} />,
    );

    // User types a custom batch name
    const nameInput = container.querySelector("#batch-name-input") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Custom Batch" } });
    expect(nameInput.value).toBe("My Custom Batch");

    // Add files
    const dropzoneInput = container.querySelector("input[type='file']") as HTMLInputElement;
    const file1 = makeFile("img1.jpg");
    const file2 = makeFile("img2.jpg");
    fireEvent.change(dropzoneInput, { target: { files: [file1, file2] } });

    expect(getAllByText("2 images selected")).toHaveLength(2);
    expect(getByText("Clear all")).toBeDefined();

    // Click "Clear all"
    fireEvent.click(getByText("Clear all"));

    // Files are cleared
    expect(queryByText("img1.jpg")).toBeNull();
    expect(queryByText("Clear all")).toBeNull();

    // User typed name is still intact!
    expect(nameInput.value).toBe("My Custom Batch");
  });
});
