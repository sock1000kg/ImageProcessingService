// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { FileDropzone } from "../src/components/FileDropzone";
import { RejectedFilesNotice } from "../src/components/RejectedFilesNotice";
import { FileSelectionIssue } from "../src/components/file-selection";

describe("Step 0: Choose folder DOM render and click isolation", () => {
  beforeAll(() => {
    // Standard browsers supporting folder selection expose webkitdirectory on HTMLInputElement
    if (!("webkitdirectory" in HTMLInputElement.prototype)) {
      Object.defineProperty(HTMLInputElement.prototype, "webkitdirectory", {
        value: "",
        writable: true,
        configurable: true,
      });
    }
  });

  it("clicking Choose folder calls click() on the folder input only and not on the files input", () => {
    const onFiles = vi.fn();
    const onFolderFiles = vi.fn();

    const { container, getByText } = render(
      <FileDropzone files={[]} errors={{}} onFiles={onFiles} onFolderFiles={onFolderFiles} />,
    );

    const inputs = container.querySelectorAll("input[type='file']");
    expect(inputs).toHaveLength(2);
    const filesInput = inputs[0] as HTMLInputElement;
    const folderInput = inputs[1] as HTMLInputElement;

    const filesClickSpy = vi.spyOn(filesInput, "click");
    const folderClickSpy = vi.spyOn(folderInput, "click");

    const chooseFolderButton = getByText("Choose folder");
    fireEvent.click(chooseFolderButton);

    expect(folderClickSpy).toHaveBeenCalledTimes(1);
    expect(filesClickSpy).not.toHaveBeenCalled();

    // Verify clicking the dropzone itself triggers the files input
    const dropzone = container.querySelector(".dropzone") as HTMLDivElement;
    fireEvent.click(dropzone);
    expect(filesClickSpy).toHaveBeenCalledTimes(1);
    expect(folderClickSpy).toHaveBeenCalledTimes(1);
  });
});

describe("RejectedFilesNotice reusable component", () => {
  it("renders null when issues is empty", () => {
    const { container } = render(<RejectedFilesNotice issues={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders title, code path, and reasons for rejected files", () => {
    const file1 = new File([], "notes.txt", { type: "text/plain" });
    const file2 = new File([], "scan.tiff", { type: "image/tiff" });
    Object.defineProperty(file2, "webkitRelativePath", { value: "sub/scan.tiff" });

    const issues: FileSelectionIssue[] = [
      { file: file1, reason: "not an image (.txt); only JPG, PNG and WEBP are accepted" },
      { file: file2, reason: "unsupported image type (image/tiff)" },
    ];

    const onDismiss = vi.fn();
    const { getByText, getByLabelText, container } = render(
      <RejectedFilesNotice issues={issues} onDismiss={onDismiss} />,
    );

    expect(getByText("2 files were not added")).toBeDefined();
    expect(getByText("sub/scan.tiff")).toBeDefined();
    expect(getByText(/unsupported image type \(image\/tiff\)/)).toBeDefined();

    const dismissBtn = getByLabelText("Dismiss rejected files list");
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    const items = container.querySelectorAll(".notice-list li");
    expect(items).toHaveLength(2);
  });

  it("caps display at 10 items and shows +n more", () => {
    const issues: FileSelectionIssue[] = Array.from({ length: 13 }, (_, i) => ({
      file: new File([], `file_${i + 1}.txt`),
      reason: "not an image",
    }));

    const { getByText, container } = render(<RejectedFilesNotice issues={issues} />);

    expect(getByText("13 files were not added")).toBeDefined();
    expect(getByText("+3 more")).toBeDefined();

    // 10 items + 1 more item
    const items = container.querySelectorAll(".notice-list li");
    expect(items).toHaveLength(11);
  });
});
