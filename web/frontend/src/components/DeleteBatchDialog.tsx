/**
 * Modal confirmation dialog displayed before destructive deletion.
 *
 * Why: Wraps the shared Dialog component with standard cancellation and confirmation actions
 * to prevent accidental loss of image files and processing results.
 */
import { Dialog } from "./ui/Dialog";

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
    <Dialog open={open} title={title} titleId="delete-title" onClose={onCancel}>
      <p>{body}</p>
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="danger-button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
