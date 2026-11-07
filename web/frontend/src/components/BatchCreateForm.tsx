/**
 * Primary batch creation form managing file dropzones, redaction configuration, and chunked upload retries.
 */
import { FormEvent, useEffect, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { FilePreviewList } from "./FilePreviewList";
import { PreviewCanvas } from "./PreviewCanvas";
import { RedactionConfigForm, FormConfig, DEFAULT_FORM_CONFIG } from "./RedactionConfigForm";
import { RejectedFilesNotice } from "./RejectedFilesNotice";
import { WhitelistUploader } from "./WhitelistUploader";
import { Banner } from "./ui/Banner";
import {
  FileSelectionIssue,
  getFileIdentity,
  getFolderName,
  validateImageFiles,
  selectFolderFiles,
  formatFolderSummary,
  getFolderLimitMessage,
  getSelectionLimitMessage,
  ensureFileType,
  getInferredImageType,
  MAX_BATCH_FILES,
} from "./file-selection";
import { Batch } from "../types";
import { UploadProgress } from "../api";

export interface BatchCreateFormProps {
  busy: boolean;
  error: string;
  onSubmit?: (
    files: File[],
    whitelist: File[],
    config: FormConfig,
    onProgress?: (progress: UploadProgress) => void,
    existingBatchId?: string,
    name?: string,
    faceListId?: string,
    faceListIds?: string[],
  ) => Promise<{ batch: Batch; failed: File[] } | void>;
  onStartWithoutFailed?: (batchId: string) => Promise<void>;
  rerunSource?: {
    batchId: string;
    batchName: string;
    imageCount: number;
    initialConfig: FormConfig;
    initialName: string;
  };
  onRerunSubmit?: (
    files: File[],
    whitelist: File[],
    config: FormConfig,
    onProgress?: (progress: UploadProgress) => void,
    name?: string,
    faceListId?: string,
    faceListIds?: string[],
  ) => Promise<{ batch: Batch; failed: File[] } | void>;
}

/**
 * Handles batch creation, optional batch renaming, file validation, and failure recovery.
 */
export function BatchCreateForm({
  busy,
  error,
  onSubmit,
  onStartWithoutFailed,
  rerunSource,
  onRerunSubmit,
}: BatchCreateFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [whitelist, setWhitelist] = useState<File[]>([]);
  const [faceListIds, setFaceListIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState(rerunSource?.initialName ?? "");
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [rejectedFiles, setRejectedFiles] = useState<FileSelectionIssue[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderSummary, setFolderSummary] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [failedState, setFailedState] = useState<{
    draftId: string;
    failedFiles: File[];
    totalOriginal: number;
  } | null>(null);
  const [config, setConfig] = useState<FormConfig>(rerunSource?.initialConfig ?? DEFAULT_FORM_CONFIG);

  useEffect(() => {
    if (rerunSource) {
      if (rerunSource.initialConfig) {
        setConfig(rerunSource.initialConfig);
      }
      if (rerunSource.initialName) {
        setBatchName(rerunSource.initialName);
      }
    }
  }, [rerunSource?.batchId]);

  const addFiles = (incoming: File[]) => {
    setFolderSummary(null);

    const issues = validateImageFiles(incoming);
    const valid = incoming.filter((file) => !issues.some((issue) => issue.file === file));

    const copiedCount = rerunSource?.imageCount ?? 0;
    if (copiedCount + files.length + valid.length > MAX_BATCH_FILES) {
      const msg = getSelectionLimitMessage(valid.length, copiedCount + files.length);
      setFileErrors({ limit: msg });
      setRejectedFiles([]);
      return;
    }

    const normalized = valid.map((file) => {
      const mime = getInferredImageType(file);
      return mime ? ensureFileType(file, mime) : file;
    });

    setRejectedFiles(issues);
    setFileErrors(Object.fromEntries(issues.map((issue) => [getFileIdentity(issue.file), issue.reason])));
    setFiles((current) => [...current, ...normalized]);
  };

  const handleFolderFiles = (incoming: File[]) => {
    if (!incoming || incoming.length === 0) {
      return;
    }

    if (files.length > 0) {
      const confirmed =
        typeof window !== "undefined" && typeof window.confirm === "function"
          ? window.confirm(`Replace the ${files.length} selected images with the folder?`)
          : true;
      if (!confirmed) {
        return;
      }
    }

    const result = selectFolderFiles(incoming);

    const copiedCount = rerunSource?.imageCount ?? 0;
    if (copiedCount + result.images.length > MAX_BATCH_FILES) {
      const msg =
        copiedCount > 0
          ? getSelectionLimitMessage(result.images.length, copiedCount)
          : getFolderLimitMessage(result.images.length);
      setFiles([]);
      setFolderName(null);
      setFolderSummary(null);
      setFileErrors({ limit: msg });
      setRejectedFiles([]);
      return;
    }

    setFiles(result.images);
    setFolderName(result.folderName);
    setFileErrors({});
    setRejectedFiles([]);
    setFolderSummary(formatFolderSummary(result));
  };

  const handleRemoveFile = (index: number) => {
    setFiles((current) => {
      const next = current.filter((_, item) => item !== index);
      if (next.length === 0) {
        setFolderName(null);
        setFolderSummary(null);
        setFileErrors({});
        setRejectedFiles([]);
      }
      return next;
    });
  };

  const handleClearAll = () => {
    setFiles([]);
    setFileErrors({});
    setRejectedFiles([]);
    setFolderName(null);
    setFolderSummary(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!config.targets.length || busy) return;

    const copiedCount = rerunSource?.imageCount ?? 0;
    if (copiedCount + files.length > MAX_BATCH_FILES) {
      const msg = getSelectionLimitMessage(files.length, copiedCount);
      setFileErrors({ limit: msg });
      return;
    }

    if (rerunSource) {
      if (onRerunSubmit) {
        setFailedState(null);
        if (files.length > 0) {
          setUploadProgress({ done: 0, total: files.length });
        }
        const trimmed = batchName.trim();
        const result = await onRerunSubmit(
          files,
          whitelist,
          config,
          files.length > 0
            ? (progress) => setUploadProgress({ done: progress.done, total: progress.total })
            : undefined,
          trimmed.length > 0 ? trimmed : undefined,
          faceListIds[0],
          faceListIds,
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
      }
      return;
    }

    if (!files.length || !onSubmit) return;
    setFailedState(null);
    setUploadProgress({ done: 0, total: files.length });
    const trimmed = batchName.trim();
    let nameToSend: string | undefined = undefined;
    if (trimmed.length > 0) {
      nameToSend = trimmed;
    } else {
      const topFolder = folderName ?? getFolderName(files);
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
      faceListIds[0],
      faceListIds,
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
    if (!failedState || busy || !onSubmit) return;
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

  return (
    <form className="create-form" aria-label="Create batch form" onSubmit={(event) => void submit(event)}>
      <div className="create-main">
        <div className="batch-name-group">
          <label htmlFor="batch-name-input" className="mini-label">
            Batch name (optional)
          </label>
          <input
            id="batch-name-input"
            type="text"
            className="text-input"
            maxLength={100}
            placeholder={folderName ? `Folder: ${folderName}` : "Optional, defaults to Batch <date>"}
            value={batchName}
            onChange={(event) => setBatchName(event.target.value)}
            disabled={busy}
          />
        </div>
        {rerunSource && (
          <div className="rerun-source-info">
            <p>
              {rerunSource.imageCount} images from {rerunSource.batchName} + any you add
            </p>
          </div>
        )}
        <FileDropzone files={files} errors={fileErrors} onFiles={addFiles} onFolderFiles={handleFolderFiles} />
        {folderSummary && <p className="folder-selection">{folderSummary}</p>}
        <RejectedFilesNotice issues={rejectedFiles} onDismiss={() => setRejectedFiles([])} />
        <FilePreviewList
          files={files}
          errors={fileErrors}
          onRemove={handleRemoveFile}
          title={rerunSource ? `${files.length} additional images selected` : `${files.length} images selected`}
          onClear={handleClearAll}
        />
        <WhitelistUploader
          files={whitelist}
          onChange={setWhitelist}
          selectedFaceListIds={faceListIds}
          onFaceListIdsChange={setFaceListIds}
        />
      </div>
      <aside className="config-card">
        <div className="create-preview-panel">
          <span className="section-kicker">Preview Sample</span>
          <PreviewCanvas
            style={config.style}
            strength={config.strength}
            targets={config.targets}
            padding={config.padding}
          />
        </div>
        <div className="section-kicker">REDACTION CONFIG</div>
        <h3>Processing profile</h3>
        <RedactionConfigForm config={config} setConfig={setConfig} />
        <button
          type="submit"
          className="primary-button submit-button"
          disabled={busy || (!rerunSource && !files.length) || !config.targets.length}
        >
          {busy && uploadProgress
            ? `Uploading ${uploadProgress.done}/${uploadProgress.total}`
            : rerunSource
              ? busy
                ? "Re-running…"
                : "Re-run batch"
              : busy && uploadProgress
                ? `Uploading ${uploadProgress.done}/${uploadProgress.total}`
                : busy
                  ? "Uploading…"
                  : "Create secure batch"}
        </button>
        {failedState && (
          <div className="upload-retry-area" role="alert">
            <span>
              {failedState.failedFiles.length} of {failedState.totalOriginal} failed
            </span>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void handleRetryFailed()}>
              Retry failed
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void handleStartWithoutThem()}
            >
              Start without them
            </button>
          </div>
        )}
        {error && <Banner variant="error">{error}</Banner>}
      </aside>
    </form>
  );
}
