/**
 * Batch image sidebar list component with deterministic ranking and status dots.
 */
import { Batch, Job, ReportImage } from "../types";
import { StatusBadge } from "./ui/StatusBadge";

export interface BatchImageListProps {
  batch: Batch;
  report: ReportImage[];
  selected: string | null;
  onSelect: (job: Job) => void;
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
export function BatchImageList({ batch, report, selected, onSelect }: BatchImageListProps) {
  const jobs = sortBatchJobs(batch, report);
  const reportByJob = new Map(report.map((image) => [image.jobId, image]));
  const needsReview = (job: Job) => reportByJob.get(job.id)?.needsReview === true;

  return (
    <div className="image-list scroll-list">
      {jobs.map((job) => {
        const isSelected = selected === job.id;
        const flagged = needsReview(job);
        const rowClass = `image-list-row ${isSelected ? "selected" : ""} ${flagged ? "needs-review-row" : ""}`.trim();

        return (
          <button key={job.id} type="button" className={rowClass} onClick={() => onSelect(job)}>
            <StatusBadge variant="dot" status={job.status} />
            <span className="image-name">
              <strong>{job.originalFilename}</strong>
              <small>
                {job.stage ?? "Waiting"} · {job.progress}%
              </small>
            </span>
            {flagged && <StatusBadge variant="pill" label="Needs review" />}
            <span className="row-status">{job.status}</span>
          </button>
        );
      })}
    </div>
  );
}
