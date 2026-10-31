/**
 * File thumbnail list displaying staged files, dimensions/types, and removal actions.
 */
import { useEffect, useState } from "react";
import { getFileIdentity, getFilePath } from "./file-selection";

export interface FilePreviewListProps {
  files: File[];
  errors: Record<string, string>;
  onRemove: (index: number) => void;
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
export function FilePreviewList({ files, errors, onRemove }: FilePreviewListProps) {
  if (!files.length) return null;

  return (
    <div className="file-list">
      {files.map((file, index) => {
        const displayPath = getFilePath(file);
        const typeLabel = (file.type ? file.type.split("/")[1] : "")?.toUpperCase() || "IMAGE";
        const fileKey = getFileIdentity(file);
        const hasError = Boolean(errors[fileKey]);

        return (
          <div className={`file-row ${hasError ? "has-error" : ""}`} key={`${fileKey}-${index}`}>
            <FileThumbnail file={file} />
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
}
