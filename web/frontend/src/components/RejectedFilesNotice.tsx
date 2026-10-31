/**
 * Dismissible warning notice listing invalid or oversized files rejected during drag-and-drop or selection.
 */
import { FileSelectionIssue, formatValidationTitle, getFilePath, getFileIdentity } from "./file-selection";
import { Banner } from "./ui/Banner";

export interface RejectedFilesNoticeProps {
  issues: FileSelectionIssue[];
  onDismiss?: () => void;
}

/**
 * Renders a summary banner and list of dropped files that failed type or size constraints.
 */
export function RejectedFilesNotice({ issues, onDismiss }: RejectedFilesNoticeProps) {
  if (!issues || issues.length === 0) {
    return null;
  }

  return (
    <Banner variant="warning" className="notice" role="status">
      <div className="notice-header">
        <strong className="notice-title">{formatValidationTitle(issues.length)}</strong>
        {onDismiss && (
          <button type="button" className="icon-button" aria-label="Dismiss rejected files list" onClick={onDismiss}>
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
        {issues.length > 10 && <li className="notice-more">+{issues.length - 10} more</li>}
      </ul>
    </Banner>
  );
}
