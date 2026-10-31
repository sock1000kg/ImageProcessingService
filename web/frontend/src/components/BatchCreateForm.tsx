import { FormEvent, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { FilePreviewList } from "./FilePreviewList";
import { PreviewCanvas } from "./PreviewCanvas";
import { RedactionConfigForm, FormConfig } from "./RedactionConfigForm";
import { WhitelistUploader } from "./WhitelistUploader";
import { FileSelectionIssue, getFileIdentity, getFolderName, validateImageFiles, MAX_BATCH_FILES } from "./file-selection";
import { Batch } from "../types";
import { UploadProgress } from "../api";

type Props = {
  busy: boolean;
  error: string;
  onSubmit: (
    files: File[],
    whitelist: File[],
    config: FormConfig,
    onProgress?: (progress: UploadProgress) => void,
    existingBatchId?: string,
    name?: string,
  ) => Promise<{ batch: Batch; failed: File[] } | void>;
  onStartWithoutFailed?: (batchId: string) => Promise<void>;
};

export function BatchCreateForm({ busy, error, onSubmit, onStartWithoutFailed }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [whitelist, setWhitelist] = useState<File[]>([]);
  const [batchName, setBatchName] = useState("");
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [rejectedFiles, setRejectedFiles] = useState<FileSelectionIssue[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [failedState, setFailedState] = useState<{ draftId: string; failedFiles: File[]; totalOriginal: number } | null>(null);
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!files.length || !config.targets.length || busy) return;
    setFailedState(null);
    setUploadProgress({ done: 0, total: files.length });
    const trimmed = batchName.trim();
    let nameToSend: string | undefined = undefined;
    if (trimmed.length > 0) {
      nameToSend = trimmed;
    } else {
      const topFolder = getFolderName(files);
      if (topFolder) {
        nameToSend = topFolder;
      }
    }
    const result = await onSubmit(
      files,
      whitelist,
      config,
      (progress) => setUploadProgress({ done: progress.done, total: progress.total }),
      undefined,
      nameToSend,
    );
    if (result && result.failed.length > 0) {
      setFailedState({
        draftId: result.batch.id,
        failedFiles: result.failed,
        totalOriginal: files.length,
      });
    } else {
      setUploadProgress(null);
    }
  };

  const handleRetryFailed = async () => {
    if (!failedState || busy) return;
    setUploadProgress({ done: 0, total: failedState.failedFiles.length });
    const result = await onSubmit(
      failedState.failedFiles,
      [],
      config,
      (progress) => setUploadProgress({ done: progress.done, total: progress.total }),
      failedState.draftId,
    );
    if (result && result.failed.length > 0) {
      setFailedState({
        draftId: failedState.draftId,
        failedFiles: result.failed,
        totalOriginal: failedState.totalOriginal,
      });
    } else {
      setFailedState(null);
      setUploadProgress(null);
    }
  };

  const handleStartWithoutThem = async () => {
    if (!failedState || busy || !onStartWithoutFailed) return;
    await onStartWithoutFailed(failedState.draftId);
    setFailedState(null);
    setUploadProgress(null);
  };

  return <form className="create-form" onSubmit={(event) => void submit(event)}>
    <div className="create-main"><div className="batch-name-group"><label htmlFor="batch-name-input" className="mini-label">Batch name (optional)</label><input id="batch-name-input" type="text" className="text-input" maxLength={100} placeholder={folderName ? `Folder: ${folderName}` : "Optional, defaults to Batch <date>"} value={batchName} onChange={(event) => setBatchName(event.target.value)} disabled={busy} /></div><FileDropzone files={files} errors={fileErrors} onFiles={addFiles} />{folderName && <p className="folder-selection">Folder selected: <strong>{folderName}</strong></p>}{rejectedFiles.length > 0 && <div className="validation-summary" role="status"><strong>{rejectedFiles.length} file(s) were not added</strong>{rejectedFiles.map((issue, index) => <span key={`${getFileIdentity(issue.file)}-${index}`}>{issue.file.name}: {issue.reason}</span>)}</div>}<FilePreviewList files={files} errors={fileErrors} onRemove={(index) => setFiles((current) => current.filter((_, item) => item !== index))} /><WhitelistUploader files={whitelist} onChange={setWhitelist} /></div>
    <aside className="config-card"><div className="section-kicker">REDACTION CONFIG</div><h3>Processing profile</h3><RedactionConfigForm config={config} setConfig={setConfig} /><div className="preview-wrap"><PreviewCanvas style={config.style} strength={config.strength} /><span>Preview runs locally. No upload is triggered.</span></div><button className="primary-button submit-button" disabled={busy || !files.length || !config.targets.length}>{busy && uploadProgress ? `Uploading ${uploadProgress.done}/${uploadProgress.total}` : (busy ? "Uploading…" : "Create secure batch")}</button>{failedState && <div className="upload-retry-area" role="alert"><span>{failedState.failedFiles.length} of {failedState.totalOriginal} failed</span><button type="button" className="secondary-button" disabled={busy} onClick={() => void handleRetryFailed()}>Retry failed</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void handleStartWithoutThem()}>Start without them</button></div>}{error && <p className="error-banner">{error}</p>}</aside>
  </form>;
}
