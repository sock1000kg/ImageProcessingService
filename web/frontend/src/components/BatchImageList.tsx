/**
 * Batch image sidebar list component with deterministic ranking, status dots, and image deletion.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteJob } from "../api";
import { Batch, Job, ReportImage } from "../types";
import { DeleteBatchDialog } from "./DeleteBatchDialog";
import { StatusBadge } from "./ui/StatusBadge";
import { TrashIcon } from "./ui/TrashIcon";

export interface BatchImageListProps {
  batch: Batch;
  report: ReportImage[];
  selected: string | null;
  onSelect: (job: Job) => void;
  onJobDeleted?: (jobId: string) => void;
  onError?: (message: string) => void;
}

/**
 * Sorts batch jobs prioritising failed jobs first, then review candidates sorted by lowest confidence.
 */
export function sortBatchJobs(batch: Batch, report: ReportImage[]): Job[] {
  const reportByJob = new Map(report.map((image) => [image.jobId, image]));
  const needsReview = (job: Job) => reportByJob.get(job.id)?.needsReview === true;
  const reviewRank = (job: Job) => {
    const image = reportByJob.get(job.id);
    const confidence = image?.lowestRedactedConfidence;
    return confidence ?? Number.POSITIVE_INFINITY;
  };

  return [...batch.jobs].sort((a, b) => {
    const failed = Number(b.status === "FAILED") - Number(a.status === "FAILED");
    if (failed !== 0) return failed;

    const review = Number(needsReview(b)) - Number(needsReview(a));
    if (review !== 0) return review;

    const confidence = reviewRank(a) - reviewRank(b);
    if (confidence !== 0) return confidence;

    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * Renders the selectable list of image jobs within the active batch.
 */
export function BatchImageList({ batch, report, selected, onSelect, onJobDeleted, onError }: BatchImageListProps) {
  const navigate = useNavigate();
  const [deletingJob, setDeletingJob] = useState<Job | null>(null);
  const jobs = sortBatchJobs(batch, report);
  const reportByJob = new Map(report.map((image) => [image.jobId, image]));
  const needsReview = (job: Job) => reportByJob.get(job.id)?.needsReview === true;

  const handleConfirmDelete = async () => {
    if (!deletingJob) return;
    const target = deletingJob;
    setDeletingJob(null);
    try {
      await deleteJob(target.id);
      if (batch.jobs.length <= 1) {
        navigate("/library");
      } else {
        onJobDeleted?.(target.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete image";
      onError?.(message);
      console.error("Failed to delete job", err);
    }
  };

  return (
    <>
      <div className="image-list scroll-list">
        {jobs.map((job) => {
          const isSelected = selected === job.id;
          const flagged = needsReview(job);
          const isActive = job.status === "QUEUED" || job.status === "PROCESSING";
          const rowClass = `image-list-row ${isSelected ? "selected" : ""} ${flagged ? "needs-review-row" : ""}`.trim();

          return (
            <div
              key={job.id}
              role="button"
              tabIndex={0}
              className={rowClass}
              onClick={() => onSelect(job)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(job);
                }
              }}
            >
              <StatusBadge variant="dot" status={job.status} />
              <span className="image-name">
                <strong>{job.originalFilename}</strong>
                <small>
                  {job.stage ?? "Waiting"} · {job.progress}%
                </small>
                {job.status === "FAILED" && job.error && (
                  <small className="failure-detail">
                    {[job.error.code, job.error.message].filter(Boolean).join(": ")}
                  </small>
                )}
              </span>
              {flagged && <StatusBadge variant="pill" label="Needs review" />}
              <span className="row-status">{job.status}</span>
              <button
                type="button"
                className="delete-item-button"
                disabled={isActive}
                title={isActive ? "Cannot delete while processing" : "Delete image"}
                aria-label={`Delete ${job.originalFilename}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingJob(job);
                }}
              >
                <TrashIcon />
              </button>
            </div>
          );
        })}
      </div>

      <DeleteBatchDialog
        open={Boolean(deletingJob)}
        title="Delete this image?"
        body="Original file and result will be removed. This cannot be undone."
        confirmLabel="Delete image"
        onCancel={() => setDeletingJob(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
}
