import { DragEvent, useEffect, useRef, useState } from "react";
import {
  ClassifiedDrop,
  classifyDrop,
  isFolderFile,
  isHiddenOrSystemFile,
  MAX_BATCH_FILES,
  MAX_FILE_BYTES,
  readFileEntry,
  walkDirectory,
  walkEntries,
  WebkitEntry,
  WebkitFileEntry,
} from "./file-selection";

type Props = {
  files: File[];
  errors: Record<string, string>;
  onFiles: (files: File[]) => void;
  onFolderFiles?: (files: File[]) => void;
};

export function FileDropzone({ files, errors, onFiles, onFolderFiles }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderSelectionSupported, setFolderSelectionSupported] = useState(true);

  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    const supported = "webkitdirectory" in input;
    setFolderSelectionSupported(supported);
    if (supported) input.setAttribute("webkitdirectory", "");
  }, []);

  const accept = (incoming: File[]) => onFiles(incoming);

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);

    try {
      const items = event.dataTransfer.items;
      const rawEntries: (WebkitEntry | null)[] = [];
      let hasWebkitGetAsEntry = false;

      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (typeof item.webkitGetAsEntry === "function") {
            hasWebkitGetAsEntry = true;
            rawEntries.push(item.webkitGetAsEntry() as WebkitEntry | null);
          }
        }
      }

      if (hasWebkitGetAsEntry) {
        const entries = rawEntries.filter((entry): entry is WebkitEntry => entry !== null);
        if (entries.length > 0) {
          const drop: ClassifiedDrop = classifyDrop(entries);
          if (drop.kind === "single-folder" && drop.folderEntry) {
            const folderFiles = await walkDirectory(drop.folderEntry, drop.folderEntry.name);
            if (onFolderFiles) {
              onFolderFiles(folderFiles);
            } else {
              onFiles(folderFiles);
            }
            return;
          }

          if (drop.kind === "files-only") {
            const filesOnly: File[] = [];
            for (const entry of entries) {
              if (entry.isFile && typeof entry.file === "function") {
                const file = await readFileEntry(entry as WebkitFileEntry);
                filesOnly.push(file);
              }
            }
            accept(filesOnly);
            return;
          }

          const allFiles = await walkEntries(entries);
          const filtered = allFiles.filter((f) => !isHiddenOrSystemFile(f));
          accept(filtered);
          return;
        }
      }

      const rawFiles = Array.from(event.dataTransfer.files ?? []);
      const detectedFiles = await Promise.all(
        rawFiles.map(async (file) => {
          const isFolder = await isFolderFile(file);
          if (isFolder) {
            Object.defineProperty(file, "isFolder", { value: true, configurable: true });
          }
          return file;
        }),
      );
      accept(detectedFiles);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to read dropped files.";
      const errorFile = new File([], "drop", { type: "" });
      Object.defineProperty(errorFile, "errorReason", {
        value: `Could not read dropped files: ${msg}`,
        configurable: true,
      });
      accept([errorFile]);
    }
  };

  const maxMb = Math.round(MAX_FILE_BYTES / (1024 * 1024));

  return (
    <div className="dropzone-wrapper">
      <input
        ref={inputRef}
        hidden
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          accept(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        hidden
        type="file"
        multiple
        {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          if (onFolderFiles) {
            onFolderFiles(selected);
          } else {
            onFiles(selected);
          }
          event.currentTarget.value = "";
        }}
      />
      <div
        className={`dropzone ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => void handleDrop(event)}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="Choose images to redact"
      >
        <span className="dropzone-icon">↑</span>
        <strong>{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Drop images here or browse"}</strong>
        <span>JPG, PNG or WEBP · up to {MAX_BATCH_FILES} files · {maxMb} MB each</span>
        <div className="dropzone-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Choose files
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!folderSelectionSupported}
            title={!folderSelectionSupported ? "Folder selection is not supported by this browser." : undefined}
            onClick={(event) => {
              event.stopPropagation();
              folderInputRef.current?.click();
            }}
          >
            Choose folder
          </button>
        </div>
        {!folderSelectionSupported && <p className="field-error">This browser does not support folder selection.</p>}
        {Object.values(errors).length > 0 && <p className="field-error">{Object.values(errors)[0]}</p>}
      </div>
    </div>
  );
}
