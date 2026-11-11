/**
 * Primary batch creation form managing file dropzones, redaction configuration, and chunked upload retries.
 */
import { FormEvent, useEffect, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { useUploadLimits } from "../hooks/useUploadLimits";
import { PlateAllowList } from "./PlateAllowList";
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
  validateMediaFiles,
  selectFolderFiles,
  formatFolderSummary,
  ensureFileType,
  getInferredMediaType,
} from "./file-selection";
import { Batch } from "../types";
import { UploadProgress } from "../api";
import { useWarnBeforeUnload } from "../hooks/useWarnBeforeUnload";

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
  ) => Promise<{ batch: Batch; failed: File[]; limitReason?: string } | void>;
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
  ) => Promise<{ batch: Batch; failed: File[]; limitReason?: string } | void>;
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
  useWarnBeforeUnload(busy);
  const limits = useUploadLimits();

  const [files, setFiles] = useState<File[]>([]);
  const [whitelist, setWhitelist] = useState<File[]>([]);
  const [faceListIds, setFaceListIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState(rerunSource?.initialName ?? "");
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [rejectedFiles, setRejectedFiles] = useState<FileSelectionIssue[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderSummary, setFolderSummary] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
    waitSeconds?: number;
  } | null>(null);
  const [failedState, setFailedState] = useState<{
    draftId: string;
    failedFiles: File[];
    totalOriginal: number;
    limitReason?: string;
  } | null>(null);
  const [config, setConfig] = useState<FormConfig>(rerunSource?.initialConfig ?? DEFAULT_FORM_CONFIG);

  const handleProgress = (progress: UploadProgress) => {
    setUploadProgress({
      done: progress.done,
      total: progress.total,
      waitSeconds: progress.waitSeconds,
    });
  };

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

    const issues = validateMediaFiles(incoming);
    const valid = incoming.filter((file) => !issues.some((issue) => issue.file === file));

    const normalized = valid.map((file) => {
      const mime = getInferredMediaType(file);
      return mime ? ensureFileType(file, mime) : file;
    });

    // Same limit the backend enforces per batch: keep what fits, list the rest as rejected with the reason.
    const room = roomForFiles(files.length);
    const accepted = normalized.slice(0, room);
    const overLimit = normalized.slice(room).map((file) => ({
      file,
      reason: `over the ${limits?.batchMaxFiles} file batch limit`,
    }));
    const rejected = [...issues, ...overLimit];

    setRejectedFiles(rejected);
    setFileErrors(Object.fromEntries(rejected.map((issue) => [getFileIdentity(issue.file), issue.reason])));
    setFiles((current) => [...current, ...accepted]);
  };

  /** How many more files fit in the batch: its limit minus the images a rerun already carries and those selected. */
  const roomForFiles = (selected: number): number => {
    if (!limits) return Number.POSITIVE_INFINITY;
    return Math.max(0, limits.batchMaxFiles - (rerunSource?.imageCount ?? 0) - selected);
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

    const room = roomForFiles(0);
    const kept = result.images.slice(0, room);
    const dropped = result.images.length - kept.length;

    setFiles(kept);
    setFolderName(result.folderName);
    setFileErrors({});
    setRejectedFiles([]);
    setFolderSummary(
      formatFolderSummary(result) +
        (dropped > 0 ? `, ${dropped} not added (over the ${limits?.batchMaxFiles} file batch limit)` : ""),
    );
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
          files.length > 0 ? handleProgress : undefined,
          trimmed.length > 0 ? trimmed : undefined,
          faceListIds[0],
          faceListIds,
        );
        if (result && result.failed.length > 0) {
          setFailedState({
            draftId: result.batch.id,
            failedFiles: result.failed,
            totalOriginal: files.length,
            limitReason: result.limitReason,
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
      handleProgress,
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
        limitReason: result.limitReason,
      });
    } else {
      setUploadProgress(null);
    }
  };

  const handleRetryFailed = async () => {
    if (!failedState || busy || !onSubmit) return;
    setUploadProgress({ done: 0, total: failedState.failedFiles.length });
    const result = await onSubmit(failedState.failedFiles, [], config, handleProgress, failedState.draftId);
    if (result && result.failed.length > 0) {
      setFailedState({
        draftId: failedState.draftId,
        failedFiles: result.failed,
        totalOriginal: failedState.totalOriginal,
        limitReason: result.limitReason,
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
        {/* Why preview here: keep preview sample visible at top of main workflow above batch name input */}
        <div className="create-preview-panel">
          <span className="section-kicker">Preview Sample</span>
          <PreviewCanvas
            style={config.style}
            strength={config.strength}
            targets={config.targets}
            padding={config.padding}
          />
        </div>
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
        <PlateAllowList
          plates={config.whitelistPlates}
          onChange={(whitelistPlates) => setConfig((current) => ({ ...current, whitelistPlates }))}
        />
      </div>
      <aside className="config-card">
        <div className="section-kicker">REDACTION CONFIG</div>
        <h3>Processing profile</h3>
        <RedactionConfigForm config={config} setConfig={setConfig} />
        {busy && uploadProgress && (
          // Why: browsers don't allow custom text in their "Leave site?" prompt, so the reason goes here.
          <p className="preview-note" role="status">
            Keep this tab open. Leaving the site will stop uploads for this batch.
          </p>
        )}
        {uploadProgress && (uploadProgress.waitSeconds ?? 0) > 0 && (
          <Banner variant="warning" role="status">
            Uploads are paused by the rate limit and resume in {uploadProgress.waitSeconds} second
            {uploadProgress.waitSeconds === 1 ? "" : "s"}. Nothing is lost.
          </Banner>
        )}
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
            {failedState.limitReason ? (
              <>
                <p className="limit-reason">{failedState.limitReason}</p>
                <span>
                  {failedState.failedFiles.length} file{failedState.failedFiles.length === 1 ? "" : "s"} not added
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void handleStartWithoutThem()}
                >
                  Start without them
                </button>
              </>
            ) : (
              <>
                <span>
                  {failedState.failedFiles.length} of {failedState.totalOriginal} failed
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void handleRetryFailed()}
                >
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
              </>
            )}
          </div>
        )}
        {error && <Banner variant="error">{error}</Banner>}
      </aside>
    </form>
  );
}
