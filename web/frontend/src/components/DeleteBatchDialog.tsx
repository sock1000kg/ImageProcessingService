/**
 * Modal confirmation dialog displayed before destructive deletion.
 */

export interface DeleteBatchDialogProps {
  open: boolean;
  title?: string;
  body?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Modal dialog prompting the user to confirm permanent batch or image deletion.
 */
export function DeleteBatchDialog({
  open,
  title = "Delete this batch?",
  body = "Original files and results will be removed. This cannot be undone.",
  confirmLabel = "Delete batch",
  onCancel,
  onConfirm,
}: DeleteBatchDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <h3 id="delete-title">{title}</h3>
        <p>{body}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
