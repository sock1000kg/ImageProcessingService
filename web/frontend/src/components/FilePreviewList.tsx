import { useEffect, useState } from "react";
import { getFileIdentity, getFilePath } from "./file-selection";

type Props = { files: File[]; errors: Record<string, string>; onRemove: (index: number) => void };
const size = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
function FileThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <img src={url ?? undefined} alt="" />;
}
export function FilePreviewList({ files, errors, onRemove }: Props) {
  if (!files.length) return null;
  return <div className="file-list">{files.map((file, index) => {
    const displayPath = getFilePath(file);
    const typeLabel = (file.type ? file.type.split("/")[1] : "")?.toUpperCase() || "IMAGE";
    return (
      <div className={`file-row ${errors[getFileIdentity(file)] ? "has-error" : ""}`} key={`${getFileIdentity(file)}-${index}`}>
        <FileThumbnail file={file} />
        <div><strong title={displayPath}>{displayPath}</strong><span>{size(file.size)} · {typeLabel}</span>{errors[getFileIdentity(file)] && <small className="field-error">{errors[getFileIdentity(file)]}</small>}</div>
        <button type="button" className="icon-button" onClick={() => onRemove(index)} aria-label={`Remove ${displayPath}`}>×</button>
      </div>
    );
  })}</div>;
}
