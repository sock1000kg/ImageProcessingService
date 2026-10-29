import { FormEvent, useState } from "react";

type Props = {
  busy: boolean;
  onSubmit: (
    files: File[],
    whitelist: File[],
    config: Record<string, unknown>,
  ) => Promise<void>;
};

export function UploadForm({ busy, onSubmit }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [whitelist, setWhitelist] = useState<File[]>([]);
  const [style, setStyle] = useState<"blur" | "pixelate" | "blackout">("blur");
  const [strength, setStrength] = useState<string>("25");
  const [quality, setQuality] = useState<"standard" | "high" | "max">("high");
  const [format, setFormat] = useState<"original" | "jpg" | "png" | "webp">("original");
  const [fileError, setFileError] = useState("");

  const maxFileBytes = 50 * 1024 * 1024;

  const handleStyleChange = (newStyle: "blur" | "pixelate" | "blackout") => {
    setStyle(newStyle);
    if (newStyle === "blur") setStrength("25");
    else if (newStyle === "pixelate") setStrength("12");
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (files.length === 0) return;

    const config: Record<string, unknown> = {
      targets: ["face", "plate"],
      style,
      quality,
      format,
    };
    if (style !== "blackout" && strength) {
      config.strength = Number(strength);
    }

    try {
      await onSubmit(files, whitelist, config);
      setFiles([]);
      setWhitelist([]);
      setFileError("");
      event.currentTarget.reset();
    } catch {
      // Error handled by parent
    }
  }

  return (
    <form className="upload-form" onSubmit={(event) => void submit(event)}>
      <label className="dropzone">
        <span className="upload-icon">↑</span>
        <strong>
          {files.length > 0
            ? `${files.length} file(s) selected: ${files.map((f) => f.name).slice(0, 3).join(", ")}${files.length > 3 ? "..." : ""}`
            : "Drop images here or browse (up to 20 files)"}
        </strong>
        <small>JPEG, PNG or WEBP · max 50 MB per file</small>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            const oversized = selected.find((f) => f.size > maxFileBytes);
            if (oversized) {
              setFiles([]);
              setFileError(`File ${oversized.name} exceeds 50 MB limit.`);
              event.target.value = "";
              return;
            }
            if (selected.length > 20) {
              setFiles([]);
              setFileError("Maximum 20 files allowed per batch.");
              event.target.value = "";
              return;
            }
            setFiles(selected);
            setFileError("");
          }}
        />
      </label>

      <div style={{ marginTop: "1rem" }}>
        <label>
          <strong>Whitelist Reference Photos (Optional, max 5 faces):</strong>
          <br />
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              if (selected.length > 5) {
                setFileError("Maximum 5 whitelist photos allowed.");
                event.target.value = "";
                return;
              }
              setWhitelist(selected);
              setFileError("");
            }}
          />
        </label>
        {whitelist.length > 0 && (
          <small>{whitelist.length} whitelist photo(s) selected</small>
        )}
      </div>

      {fileError && <p className="field-error">{fileError}</p>}

      <div className="task-panel">
        <label>
          Redaction style
          <select
            value={style}
            onChange={(e) => handleStyleChange(e.target.value as "blur" | "pixelate" | "blackout")}
          >
            <option value="blur">Blur</option>
            <option value="pixelate">Pixelate</option>
            <option value="blackout">Blackout</option>
          </select>
        </label>

        {style !== "blackout" && (
          <label>
            Strength ({style === "blur" ? "radius: 25" : "pixel size: 12"})
            <input
              type="number"
              min="1"
              max="100"
              value={strength}
              onChange={(e) => setStrength(e.target.value)}
            />
          </label>
        )}

        <label>
          Output Quality
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as "standard" | "high" | "max")}
          >
            <option value="standard">Standard</option>
            <option value="high">High</option>
            <option value="max">Max</option>
          </select>
        </label>

        <label>
          Output Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "original" | "jpg" | "png" | "webp")}
          >
            <option value="original">Original</option>
            <option value="jpg">JPEG (.jpg)</option>
            <option value="png">PNG (.png)</option>
            <option value="webp">WEBP (.webp)</option>
          </select>
        </label>

        <button disabled={busy || files.length === 0}>
          {busy ? "Uploading batch..." : "Submit batch redaction →"}
        </button>
      </div>
    </form>
  );
}
