import { ChangeEvent } from "react";
type Props = { files: File[]; onChange: (files: File[]) => void };
export function WhitelistUploader({ files, onChange }: Props) {
  const change = (event: ChangeEvent<HTMLInputElement>) => onChange(Array.from(event.target.files ?? []).slice(0, 5));
  return <div className="whitelist-box"><div><span className="mini-label">OPTIONAL</span><h3>Face whitelist</h3><p>Reference faces will not be redacted when similarity is above the threshold.</p></div><label className="button secondary-button">Add references<input hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={change} /></label>{files.length > 0 && <span className="file-count">{files.length}/5 selected</span>}</div>;
}
