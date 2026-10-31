import { FileSelectionIssue, formatValidationTitle, getFilePath, getFileIdentity } from "./file-selection";

type Props = {
  issues: FileSelectionIssue[];
  onDismiss?: () => void;
};

export function RejectedFilesNotice({ issues, onDismiss }: Props) {
  if (!issues || issues.length === 0) {
    return null;
  }

  return (
    <div className="notice warning-banner" role="status">
      <div className="notice-header">
        <strong className="notice-title">{formatValidationTitle(issues.length)}</strong>
        {onDismiss && (
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss rejected files list"
            onClick={onDismiss}
          >
            ×
          </button>
        )}
      </div>
      <ul className="notice-list">
        {issues.slice(0, 10).map((issue, index) => (
          <li key={`${getFileIdentity(issue.file)}-${index}`}>
            <code className="notice-code">{getFilePath(issue.file)}</code> — {issue.reason}
          </li>
        ))}
        {issues.length > 10 && (
          <li className="notice-more">
            +{issues.length - 10} more
          </li>
        )}
      </ul>
    </div>
  );
}
