import { DragEvent, useRef, useState } from "react";

type Props = {
  files: File[];
  errors: Record<string, string>;
  onFiles: (files: File[]) => void;
};

export function FileDropzone({ files, errors, onFiles }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = (incoming: File[]) => onFiles([...files, ...incoming]);
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
      <input ref={inputRef} hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => accept(Array.from(event.target.files ?? []))} />
      <span className="dropzone-icon">↑</span>
      <strong>{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Drop images here or browse"}</strong>
      <span>JPG, PNG or WEBP · up to 20 files · 50 MB each</span>
      {Object.values(errors).length > 0 && <p className="field-error">{Object.values(errors)[0]}</p>}
    </div>
  );
}
