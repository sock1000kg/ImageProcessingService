export function DeleteBatchDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h3 id="delete-title">Delete this batch?</h3><p>Original files and results will be removed. This cannot be undone.</p><div className="dialog-actions"><button className="secondary-button" onClick={onCancel}>Cancel</button><button className="danger-button" onClick={onConfirm}>Delete batch</button></div></div></div>;
}
