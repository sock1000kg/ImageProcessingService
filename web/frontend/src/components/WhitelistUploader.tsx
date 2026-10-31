/**
 * File upload input and preview list for optional biometric reference whitelist faces.
 */
import { ChangeEvent, useRef, useState } from "react";
import { addWhitelistFiles, FileSelectionIssue, MAX_WHITELIST_FILES } from "./file-selection";
import { FilePreviewList } from "./FilePreviewList";
import { RejectedFilesNotice } from "./RejectedFilesNotice";

export interface WhitelistUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
}

/**
 * Handles selection of up to 5 reference face images excluded from redaction.
 */
export function WhitelistUploader({ files, onChange }: WhitelistUploaderProps) {
  const [issues, setIssues] = useState<FileSelectionIssue[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    // Reset file input value immediately so re-selecting the same file after removal triggers onChange
    event.target.value = "";
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (!incoming.length) return;

    const result = addWhitelistFiles(files, incoming, MAX_WHITELIST_FILES);
    onChange(result.files);
    setIssues(result.issues);
  };

  const handleRemove = (index: number) => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    const next = files.filter((_, i) => i !== index);
    onChange(next);
  };

  return (
    <div className="whitelist-box">
      <div className="whitelist-header">
        <div>
          <span className="mini-label">OPTIONAL</span>
          <h3>Face whitelist</h3>
          <p>Reference faces will not be redacted when similarity is above the threshold.</p>
        </div>
        <div className="whitelist-actions">
          <label className="button secondary-button">
            Add references
            <input
              ref={inputRef}
              hidden
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={change}
            />
          </label>
          {files.length > 0 && (
            <span className="file-count">
              {files.length}/{MAX_WHITELIST_FILES} selected
            </span>
          )}
        </div>
      </div>
      <RejectedFilesNotice issues={issues} onDismiss={() => setIssues([])} />
      {/*
        The badge label `#1`, `#2`... maps 1:1 to the 0-based whitelistRef index
        used by backend reports and telemetry ("person X appears in N images").
      */}
      <FilePreviewList files={files} onRemove={handleRemove} label={(index) => `#${index + 1}`} />
    </div>
  );
}
