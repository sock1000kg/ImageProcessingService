import { FormEvent, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { FilePreviewList } from "./FilePreviewList";
import { PreviewCanvas } from "./PreviewCanvas";
import { RedactionConfigForm, FormConfig } from "./RedactionConfigForm";
import { WhitelistUploader } from "./WhitelistUploader";
type Props = { busy: boolean; error: string; onSubmit: (files: File[], whitelist: File[], config: FormConfig) => Promise<void> };
const allowed = ["image/jpeg", "image/png", "image/webp"];
export function BatchCreateForm({ busy, error, onSubmit }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [whitelist, setWhitelist] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<FormConfig>({ targets: ["face", "plate"], style: "blur", strength: 25, padding: 0.1, quality: "high", format: "original", confidenceThreshold: 0.35, reviewThreshold: 0.5, similarityThreshold: 0.6 });
  const addFiles = (incoming: File[]) => {
    const errors: Record<string, string> = {};
    const valid = incoming.filter((file) => {
      if (!allowed.includes(file.type)) { errors[file.name] = "Unsupported format"; return false; }
      if (file.size > 50 * 1024 * 1024) { errors[file.name] = "File exceeds 50 MB"; return false; }
      return true;
    });
    setFileErrors(errors); setFiles((current) => [...current, ...valid].slice(0, 20));
  };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!files.length || !config.targets.length || busy) return; await onSubmit(files, whitelist, config); };
  return <form className="create-form" onSubmit={(event) => void submit(event)}>
    <div className="create-main"><FileDropzone files={files} errors={fileErrors} onFiles={addFiles} /><FilePreviewList files={files} errors={fileErrors} onRemove={(index) => setFiles((current) => current.filter((_, item) => item !== index))} /><WhitelistUploader files={whitelist} onChange={setWhitelist} /></div>
    <aside className="config-card"><div className="section-kicker">REDACTION CONFIG</div><h3>Processing profile</h3><RedactionConfigForm config={config} setConfig={setConfig} /><div className="preview-wrap"><PreviewCanvas style={config.style} strength={config.strength} /><span>Preview runs locally. No upload is triggered.</span></div><button className="primary-button submit-button" disabled={busy || !files.length || !config.targets.length}>{busy ? "Uploading…" : "Create secure batch"}</button>{error && <p className="error-banner">{error}</p>}</aside>
  </form>;
}
