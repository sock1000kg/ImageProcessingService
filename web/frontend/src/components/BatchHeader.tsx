/**
 * Batch header component with active status indicators, progress breakdown, and inline renaming.
 */
import { renameBatch } from "../api";
import { Batch } from "../types";
import { InlineRename } from "./InlineRename";
import { StatusBadge } from "./ui/StatusBadge";

export interface BatchHeaderProps {
  batch: Batch;
  onDelete: () => void;
  onBatchUpdated?: (batch: Batch) => void;
}

/**
 * Displays active batch metadata, overall completion progress, and supports renaming in-place.
 */
export function BatchHeader({ batch, onDelete, onBatchUpdated }: BatchHeaderProps) {
  const handleSave = async (newName: string) => {
    const response = await renameBatch(batch.id, newName);
    onBatchUpdated?.(response.batch);
  };

  const completed = batch.jobs.filter((job) => job.status === "COMPLETED").length;
  const progress = batch.jobs.length
    ? Math.round(batch.jobs.reduce((sum, job) => sum + job.progress, 0) / batch.jobs.length)
    : 0;

  return (
    <div className="batch-header">
      <div>
        <span className="section-kicker">ACTIVE BATCH</span>
        <InlineRename name={batch.name} onSave={handleSave} headingLevel="h2" />
        <small className="batch-id-text">{batch.id}</small>
        <p>Created {new Date(batch.createdAt).toLocaleString()}</p>
      </div>
      <div className="batch-header-meta">
        <StatusBadge status={batch.status} />
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
