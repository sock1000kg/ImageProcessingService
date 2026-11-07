/**
 * Batch image sidebar list component with deterministic ranking, status dots, and image deletion.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash, Warning } from "@phosphor-icons/react";
import { deleteJob } from "../api";
import { Batch, Job, ReportImage } from "../types";
import { DeleteBatchDialog } from "./DeleteBatchDialog";
import { StatusBadge } from "./ui/StatusBadge";

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
 * Formats a batch job's status and progress into a concise human-readable status line.
 */
export function formatJobRowStatus(job: Pick<Job, "status" | "progress">): string {
  if (job.status === "COMPLETED") return "Done";
  if (job.status === "PROCESSING") return `Processing · ${job.progress}%`;
  if (job.status === "FAILED") return "Failed";
  if (job.status === "QUEUED") return "Queued";
  return "Waiting";
}

/**
 * Splits a filename for middle-truncation in image list rows.
 * Filenames of 20 characters or fewer are kept intact in start with empty end;
 * longer filenames place the final 10 characters in end.
 */
export function splitFilename(name: string): { start: string; end: string } {
  if (name.length <= 20) {
    return { start: name, end: "" };
  }
  return {
    start: name.slice(0, -10),
    end: name.slice(-10),
  };
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
          const rowClass = `image-list-row ${isSelected ? "selected" : ""}`.trim();
          const { start, end } = splitFilename(job.originalFilename);

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
                <strong title={job.originalFilename} className="row-name">
                  <span className="row-name-start">{start}</span>
                  {end && <span className="row-name-end">{end}</span>}
                </strong>
                <small className="row-meta">
                  {formatJobRowStatus(job)}
                  {flagged && (
                    <>
                      {" · "}
                      <span className="row-review">
                        <Warning aria-hidden /> Needs review
                      </span>
                    </>
                  )}
                </small>
                {job.status === "FAILED" && job.error && (
                  <small className="failure-detail">
                    {[job.error.code, job.error.message].filter(Boolean).join(": ")}
                  </small>
                )}
              </span>
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
                <Trash aria-hidden />
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
