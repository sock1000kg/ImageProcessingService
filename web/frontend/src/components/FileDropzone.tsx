/**
 * Drag-and-drop file and folder intake zone, plus the click-to-browse and "Choose folder" buttons.
 */
import { useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { useUploadLimits } from "../hooks/useUploadLimits";
import { formatMegabytes } from "../utils/format";
import { readDroppedFiles } from "./file-selection";

export interface FileDropzoneProps {
  files: File[];
  errors: Record<string, string>;
  onFiles: (files: File[]) => void;
  onFolderFiles?: (files: File[]) => void;
}

/**
 * Dropzone accepting dropped files and folders (react-dropzone reads inside folders for us) or the browse buttons.
 * A drop of exactly one folder goes to `onFolderFiles` (folder mode); anything else goes to `onFiles`.
 */
export function FileDropzone({ files, errors, onFiles, onFolderFiles }: FileDropzoneProps) {
  const limits = useUploadLimits();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderSelectionSupported, setFolderSelectionSupported] = useState(true);

  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    const supported = "webkitdirectory" in input;
    setFolderSelectionSupported(supported);
    if (supported) input.setAttribute("webkitdirectory", "");
  }, []);

  const sendFolderFiles = (selected: File[]) => (onFolderFiles ?? onFiles)(selected);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (dropped) => {
      const { folderFiles, otherFiles } = readDroppedFiles(dropped);
      if (folderFiles) sendFolderFiles(folderFiles);
      else onFiles(otherFiles);
    },
    // A failed read is shown as a rejected placeholder file in the list instead of being lost silently.
    onError: (error) => {
      const errorFile = new File([], "drop", { type: "" });
      Object.defineProperty(errorFile, "errorReason", {
        value: `Could not read dropped files: ${error.message || "error"}`,
        configurable: true,
      });
      onFiles([errorFile]);
    },
  });

  return (
    <div className="dropzone-wrapper">
      <input {...getInputProps({ accept: "image/jpeg,image/png,image/webp,video/mp4" })} />
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
        {...getRootProps({
          className: `dropzone ${isDragActive ? "is-dragging" : ""}`,
          role: "button",
          "aria-label": "Choose images to redact",
        })}
      >
        <span className="dropzone-icon">
          <UploadSimpleIcon aria-hidden />
        </span>
        <strong>
          {files.length
            ? `${files.length} image${files.length === 1 ? "" : "s"} selected`
            : "Drop images or MP4 videos here or browse"}
        </strong>
        <span>
          JPG, PNG, WEBP or MP4
          {limits &&
            ` · photos up to ${formatMegabytes(limits.imageUploadMaxBytes)}, videos up to ${formatMegabytes(limits.videoUploadMaxBytes)}`}
        </span>
        <div className="dropzone-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={(event) => {
              event.stopPropagation();
              open();
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
