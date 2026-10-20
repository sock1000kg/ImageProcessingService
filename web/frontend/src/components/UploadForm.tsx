import { FormEvent, useState } from "react";

type Props = {
  busy: boolean;
  onSubmit: (file: File, type: string, params: Record<string, unknown>) => Promise<void>;
};

export function UploadForm({ busy, onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("object-detection");
  const [targetFormat, setTargetFormat] = useState("WEBP");
  const [quality, setQuality] = useState("85");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [confidence, setConfidence] = useState("0.35");
  const [fileError, setFileError] = useState("");
  const maxFileBytes = 50 * 1024 * 1024;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    const params = type === "object-detection"
      ? { confidenceThreshold: Number(confidence) }
      : {
          targetFormat,
          quality: Number(quality),
          ...(width ? { width: Number(width) } : {}),
          ...(height ? { height: Number(height) } : {}),
        };
    await onSubmit(file, type, params);
    setFile(null);
    setPreview(null);
    setFileError("");
    event.currentTarget.reset();
  }

  return (
    <form className="upload-form" onSubmit={(event) => void submit(event)}>
      <label className="dropzone">
        {preview ? <img src={preview} alt="Selected preview" /> : <span className="upload-icon">↑</span>}
        <strong>{file ? file.name : "Drop an image here or browse"}</strong>
        <small>JPEG, PNG or WEBP · max 50 MB</small>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          if (selected && selected.size > maxFileBytes) {
            setFile(null);
            setPreview(null);
            setFileError("This file is larger than the 50 MB limit.");
            event.target.value = "";
            return;
          }
          setFile(selected);
          setPreview(selected ? URL.createObjectURL(selected) : null);
          setFileError("");
        }} />
      </label>
      {fileError && <p className="field-error">{fileError}</p>}
      <div className="task-panel">
        <label>Transformation<select value={type} onChange={(event) => setType(event.target.value)}><option value="object-detection">Object detection (AI)</option><option value="image-convert">Image convert</option></select></label>
        {type === "object-detection" && <label>Confidence threshold <output>{Number(confidence).toFixed(2)}</output><input type="range" min="0.1" max="0.95" step="0.05" value={confidence} onChange={(event) => setConfidence(event.target.value)} /></label>}
        <button disabled={busy || !file}>{busy ? "Processing..." : "Start transformation →"}</button>
      </div>
      {type === "image-convert" && <div className="options">
        <label>Target format<select value={targetFormat} onChange={(event) => setTargetFormat(event.target.value)}><option>WEBP</option><option>JPEG</option><option>PNG</option></select></label>
        <label>Quality (1-100)<input type="number" min="1" max="100" value={quality} onChange={(event) => setQuality(event.target.value)} /></label>
        <label>Width (optional)<input type="number" min="1" value={width} onChange={(event) => setWidth(event.target.value)} /></label>
        <label>Height (optional)<input type="number" min="1" value={height} onChange={(event) => setHeight(event.target.value)} /></label>
      </div>}
    </form>
  );
}
