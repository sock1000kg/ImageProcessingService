import { useEffect, useRef, useState } from "react";
import { renameBatch } from "../api";
import { Batch } from "../types";

type Props = {
  batch: Batch;
  onDelete: () => void;
  onBatchUpdated?: (batch: Batch) => void;
};

export function BatchHeader({ batch, onDelete, onBatchUpdated }: Props) {
  const [name, setName] = useState(batch.name);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(batch.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    setName(batch.name);
    if (!isEditing) {
      setEditValue(batch.name);
    }
  }, [batch.name, isEditing]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    cancelRef.current = false;
    setError("");
    setEditValue(name);
    setIsEditing(true);
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setEditValue(name);
    setIsEditing(false);
    setError("");
  };

  const handleSave = async () => {
    if (cancelRef.current || saving) return;
    const trimmed = editValue.trim();
    if (trimmed === name) {
      setIsEditing(false);
      setError("");
      return;
    }

    setSaving(true);
    try {
      const response = await renameBatch(batch.id, editValue);
      setName(response.batch.name);
      setIsEditing(false);
      setError("");
      onBatchUpdated?.(response.batch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename batch");
      setIsEditing(false);
      setEditValue(name);
    } finally {
      setSaving(false);
    }
  };

  const completed = batch.jobs.filter((job) => job.status === "COMPLETED").length;
  const progress = batch.jobs.length
    ? Math.round(batch.jobs.reduce((sum, job) => sum + job.progress, 0) / batch.jobs.length)
    : 0;

  return (
    <div className="batch-header">
      <div>
        <span className="section-kicker">ACTIVE BATCH</span>
        <div className="batch-title-row">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="batch-title-input"
              value={editValue}
              maxLength={100}
              disabled={saving}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancel();
                }
              }}
              onBlur={() => {
                void handleSave();
              }}
            />
          ) : (
            <div className="batch-title-display">
              <h2>{name}</h2>
              <button
                type="button"
                className="pencil-button"
                onClick={handleStartEdit}
                title="Rename batch"
                aria-label="Rename batch"
              >
                ✎
              </button>
            </div>
          )}
        </div>
        {error && (
          <p className="rename-error" role="alert">
            {error}
          </p>
        )}
        <small className="batch-id-text">{batch.id}</small>
        <p>Created {new Date(batch.createdAt).toLocaleString()}</p>
      </div>
      <div className="batch-header-meta">
        <span className={`status ${batch.status.toLowerCase()}`}>{batch.status}</span>
        <strong>
          {completed}/{batch.jobs.length} complete
        </strong>
        <span>{progress}% overall</span>
        <button className="danger-button" onClick={onDelete}>
          Delete batch
        </button>
      </div>
    </div>
  );
}
