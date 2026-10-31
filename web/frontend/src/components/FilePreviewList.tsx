/**
 * File thumbnail list displaying staged files, dimensions/types, and removal actions.
 */
import { useEffect, useState } from "react";
import { getFileIdentity, getFilePath } from "./file-selection";

export interface FilePreviewListProps {
  files: File[];
  errors?: Record<string, string>;
  onRemove: (index: number) => void;
  /**
   * Optional thumbnail badge label generator.
   * Whitelist uses `#1`, `#2`... matching the 0-based `whitelistRef` index that
   * backend reports use to attribute matches ("person X appears in N images").
   */
  label?: (index: number) => string;
  /** Optional title for the header row rendered above the list. */
  title?: string;
  /** Optional clear handler that renders a "Clear all" button in the header row. */
  onClear?: () => void;
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function FileThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return <img src={url ?? undefined} alt="" />;
}

/**
 * Lists uploaded or selected files with preview thumbnails and inline validation errors.
 */
export function FilePreviewList({ files, errors = {}, onRemove, label, title, onClear }: FilePreviewListProps) {
  if (!files.length) return null;

  const hasHeader = Boolean(title || onClear);

  const listElement = (
    <div className="file-list scroll-list">
      {files.map((file, index) => {
        const displayPath = getFilePath(file);
        const typeLabel = (file.type ? file.type.split("/")[1] : "")?.toUpperCase() || "IMAGE";
        const fileKey = getFileIdentity(file);
        const hasError = Boolean(errors[fileKey]);
        const badge = label ? label(index) : null;

        return (
          <div className={`file-row ${hasError ? "has-error" : ""}`} key={`${fileKey}-${index}`}>
            <div className="thumbnail-container">
              <FileThumbnail file={file} />
              {badge && <span className="thumbnail-badge">{badge}</span>}
            </div>
            <div>
              <strong title={displayPath}>{displayPath}</strong>
              <span>
                {formatSize(file.size)} · {typeLabel}
              </span>
              {hasError && <small className="field-error">{errors[fileKey]}</small>}
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${displayPath}`}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );

  if (!hasHeader) {
    return listElement;
  }

  return (
    <div className="file-preview-wrap">
      <div className="file-list-header">
        {title && <span className="file-list-title">{title}</span>}
        {title && onClear && <span className="file-list-divider"> · </span>}
        {onClear && (
          <button type="button" className="file-list-clear" onClick={onClear}>
            Clear all
          </button>
        )}
      </div>
      {listElement}
    </div>
  );
}
