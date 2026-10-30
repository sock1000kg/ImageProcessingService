import { FormEvent, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { FilePreviewList } from "./FilePreviewList";
import { PreviewCanvas } from "./PreviewCanvas";
import { RedactionConfigForm, FormConfig } from "./RedactionConfigForm";
import { WhitelistUploader } from "./WhitelistUploader";
import { FileSelectionIssue, getFileIdentity, validateImageFiles, MAX_BATCH_FILES } from "./file-selection";
type Props = { busy: boolean; error: string; onSubmit: (files: File[], whitelist: File[], config: FormConfig) => Promise<void> };
export function BatchCreateForm({ busy, error, onSubmit }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [whitelist, setWhitelist] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [rejectedFiles, setRejectedFiles] = useState<FileSelectionIssue[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [config, setConfig] = useState<FormConfig>({ targets: ["face", "plate"], style: "blur", strength: 25, padding: 0.1, quality: "high", format: "original", confidenceThreshold: 0.35, reviewThreshold: 0.5, similarityThreshold: 0.6 });
  const addFiles = (incoming: File[], selectedFolderName?: string | null) => {
    const issues = validateImageFiles(incoming);
    const valid = incoming.filter((file) => !issues.some((issue) => issue.file === file));
    setRejectedFiles(issues);
    setFileErrors(Object.fromEntries(issues.map((issue) => [getFileIdentity(issue.file), issue.reason])));
    setFolderName(selectedFolderName ?? folderName);
    if (files.length + valid.length > MAX_BATCH_FILES) {
      setRejectedFiles([
        ...issues,
        ...valid.map((file) => ({ file, reason: `Selection exceeds the ${MAX_BATCH_FILES}-file batch limit.` })),
      ]);
      return;
    }
    setFiles((current) => [...current, ...valid]);
  };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!files.length || !config.targets.length || busy) return; await onSubmit(files, whitelist, config); };
  return <form className="create-form" onSubmit={(event) => void submit(event)}>
    <div className="create-main"><FileDropzone files={files} errors={fileErrors} onFiles={addFiles} />{folderName && <p className="folder-selection">Folder selected: <strong>{folderName}</strong></p>}{rejectedFiles.length > 0 && <div className="validation-summary" role="status"><strong>{rejectedFiles.length} file(s) were not added</strong>{rejectedFiles.map((issue, index) => <span key={`${getFileIdentity(issue.file)}-${index}`}>{issue.file.name}: {issue.reason}</span>)}</div>}<FilePreviewList files={files} errors={fileErrors} onRemove={(index) => setFiles((current) => current.filter((_, item) => item !== index))} /><WhitelistUploader files={whitelist} onChange={setWhitelist} /></div>
    <aside className="config-card"><div className="section-kicker">REDACTION CONFIG</div><h3>Processing profile</h3><RedactionConfigForm config={config} setConfig={setConfig} /><div className="preview-wrap"><PreviewCanvas style={config.style} strength={config.strength} /><span>Preview runs locally. No upload is triggered.</span></div><button className="primary-button submit-button" disabled={busy || !files.length || !config.targets.length}>{busy ? "Uploading…" : "Create secure batch"}</button>{error && <p className="error-banner">{error}</p>}</aside>
  </form>;
}
