type Props = { files: File[]; errors: Record<string, string>; onRemove: (index: number) => void };
const size = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function FilePreviewList({ files, errors, onRemove }: Props) {
  if (!files.length) return null;
  return <div className="file-list">{files.map((file, index) => (
    <div className={`file-row ${errors[file.name] ? "has-error" : ""}`} key={`${file.name}-${index}`}>
      <img src={URL.createObjectURL(file)} alt="" />
      <div><strong>{file.name}</strong><span>{size(file.size)} · {file.type.split("/")[1]?.toUpperCase()}</span>{errors[file.name] && <small className="field-error">{errors[file.name]}</small>}</div>
      <button type="button" className="icon-button" onClick={() => onRemove(index)} aria-label={`Remove ${file.name}`}>×</button>
    </div>
  ))}</div>;
}
