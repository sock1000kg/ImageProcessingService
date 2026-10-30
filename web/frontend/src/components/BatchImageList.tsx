import { Batch, Job, ReportImage } from "../types";
type Props = { batch: Batch; selected: string | null; onSelect: (job: Job) => void };
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
export function BatchImageList({ batch, report, selected, onSelect }: Props & { report: ReportImage[] }) {
  const jobs = sortBatchJobs(batch, report);
  const reportByJob = new Map(report.map((image) => [image.jobId, image]));
  const needsReview = (job: Job) => reportByJob.get(job.id)?.needsReview === true;
  return <div className="image-list">{jobs.map((job) => <button className={`image-list-row ${selected === job.id ? "selected" : ""} ${needsReview(job) ? "needs-review-row" : ""}`} key={job.id} onClick={() => onSelect(job)}><span className={`status-dot ${job.status.toLowerCase()}`} /><span className="image-name"><strong>{job.originalFilename}</strong><small>{job.stage ?? "Waiting"} · {job.progress}%</small></span>{needsReview(job) && <span className="review-pill">Needs review</span>}<span className="row-status">{job.status}</span></button>)}</div>;
}
