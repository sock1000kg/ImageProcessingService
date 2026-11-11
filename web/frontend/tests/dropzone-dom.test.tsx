// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent, within, waitFor } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
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

    const { container, getByRole } = render(
      <FileDropzone files={[]} errors={{}} onFiles={onFiles} onFolderFiles={onFolderFiles} />,
    );

    const inputs = container.querySelectorAll("input[type='file']");
    expect(inputs).toHaveLength(2);
    const filesInput = inputs[0] as HTMLInputElement;
    const folderInput = inputs[1] as HTMLInputElement;

    const filesClickSpy = vi.spyOn(filesInput, "click");
    const folderClickSpy = vi.spyOn(folderInput, "click");

    const chooseFolderButton = getByRole("button", { name: /folder/i });
    fireEvent.click(chooseFolderButton);

    expect(folderClickSpy).toHaveBeenCalledTimes(1);
    expect(filesClickSpy).not.toHaveBeenCalled();

    // Verify clicking the dropzone itself triggers the files input
    const dropzone = getByRole("button", { name: /choose images|drop/i });
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
    const { getByText, getByRole } = render(<RejectedFilesNotice issues={issues} onDismiss={onDismiss} />);

    expect(getByRole("status")).toBeDefined();
    expect(getByText("sub/scan.tiff")).toBeDefined();
    expect(getByText(/unsupported image type/i)).toBeDefined();

    const dismissBtn = getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    const items = within(getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("caps display at 10 items and shows +n more", () => {
    const issues: FileSelectionIssue[] = Array.from({ length: 13 }, (_, i) => ({
      file: new File([], `file_${i + 1}.txt`),
      reason: "not an image",
    }));

    const { getByText, getByRole } = render(<RejectedFilesNotice issues={issues} />);

    expect(getByRole("status")).toBeDefined();
    expect(getByText(/\+3/i)).toBeDefined();

    // 10 items + 1 more item
    const items = within(getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(11);
  });
});

describe("Dropping folders and files", () => {
  /** A fake dropped file entry, as the browser's webkitGetAsEntry gives it. */
  function fileEntry(name: string, fullPath: string) {
    return {
      name,
      fullPath,
      isFile: true,
      isDirectory: false,
      file: (done: (file: File) => void) => done(new File([new Uint8Array(10)], name, { type: "image/jpeg" })),
    };
  }

  /** A fake dropped folder whose entries are handed out in two chunks, like Chromium does. */
  function folderEntry(name: string, children: unknown[]) {
    return {
      name,
      fullPath: `/${name}`,
      isFile: false,
      isDirectory: true,
      createReader: () => {
        let call = 0;
        return {
          readEntries: (done: (entries: unknown[]) => void) => {
            call++;
            done(call === 1 ? children.slice(0, 1) : call === 2 ? children.slice(1) : []);
          },
        };
      },
    };
  }

  function dropOn(zone: HTMLElement, entries: Array<{ isFile: boolean; name: string }>) {
    // Like a browser: a dropped file can be read directly, a dropped folder only through its entry.
    const items = entries.map((entry) => ({
      kind: "file",
      webkitGetAsEntry: () => entry,
      getAsFile: () => (entry.isFile ? new File([new Uint8Array(10)], entry.name, { type: "image/jpeg" }) : null),
    }));
    fireEvent.drop(zone, { dataTransfer: { items, files: [], types: ["Files"] } });
  }

  it("sends one dropped folder, with its sub-folders, to the folder handler with relative paths", async () => {
    const onFiles = vi.fn();
    const onFolderFiles = vi.fn();
    const { getByRole } = render(
      <FileDropzone files={[]} errors={{}} onFiles={onFiles} onFolderFiles={onFolderFiles} />,
    );

    dropOn(getByRole("button", { name: /choose images|drop/i }), [
      folderEntry("trip", [
        fileEntry("a.jpg", "/trip/a.jpg"),
        folderEntry("day2", [fileEntry("b.jpg", "/trip/day2/b.jpg")]),
      ]),
    ]);

    await waitFor(() => expect(onFolderFiles).toHaveBeenCalledTimes(1));
    const received = onFolderFiles.mock.calls[0][0] as File[];
    expect(received.map((file) => (file as File & { webkitRelativePath: string }).webkitRelativePath).sort()).toEqual([
      "trip/a.jpg",
      "trip/day2/b.jpg",
    ]);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("sends loose dropped files to the file handler", async () => {
    const onFiles = vi.fn();
    const onFolderFiles = vi.fn();
    const { getByRole } = render(
      <FileDropzone files={[]} errors={{}} onFiles={onFiles} onFolderFiles={onFolderFiles} />,
    );

    dropOn(getByRole("button", { name: /choose images|drop/i }), [
      fileEntry("a.jpg", "/a.jpg"),
      fileEntry("b.jpg", "/b.jpg"),
    ]);

    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect((onFiles.mock.calls[0][0] as File[]).map((file) => file.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(onFolderFiles).not.toHaveBeenCalled();
  });
});
