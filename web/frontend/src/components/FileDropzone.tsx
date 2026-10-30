import { DragEvent, useEffect, useRef, useState } from "react";
import { getFolderName } from "./file-selection";

type Props = {
  files: File[];
  errors: Record<string, string>;
  onFiles: (files: File[], folderName?: string | null) => void;
};

export function FileDropzone({ files, errors, onFiles }: Props) {
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
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    accept(Array.from(event.dataTransfer.files));
  };
  return (
    <div
      className={`dropzone ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
      role="button"
      tabIndex={0}
      aria-label="Choose images to redact"
    >
      <input ref={inputRef} hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { accept(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
      <span className="dropzone-icon">↑</span>
      <strong>{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Drop images here or browse"}</strong>
      <span>JPG, PNG or WEBP · up to 20 files · 50 MB each</span>
      <div className="dropzone-actions">
        <button type="button" className="secondary-button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>Choose files</button>
        <button type="button" className="secondary-button" disabled={!folderSelectionSupported} title={!folderSelectionSupported ? "Folder selection is not supported by this browser." : undefined} onClick={(event) => { event.stopPropagation(); folderInputRef.current?.click(); }}>Choose folder</button>
        <input ref={folderInputRef} hidden type="file" multiple onChange={(event) => { const selected = Array.from(event.target.files ?? []); onFiles(selected, getFolderName(selected)); event.currentTarget.value = ""; }} />
      </div>
      {!folderSelectionSupported && <p className="field-error">This browser does not support folder selection.</p>}
      {Object.values(errors).length > 0 && <p className="field-error">{Object.values(errors)[0]}</p>}
    </div>
  );
}
