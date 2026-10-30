import { Batch, Job } from "../types";
type Props = { batch: Batch; selected: string | null; onSelect: (job: Job) => void };
const needsReview = (job: Job) => job.status === "FAILED" || Boolean((job.resultSummary as { detections?: Array<{ needsReview?: boolean }> } | null)?.detections?.some((item) => item.needsReview));
export function BatchImageList({ batch, selected, onSelect }: Props) {
  const jobs = [...batch.jobs].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a)));
  return <div className="image-list">{jobs.map((job) => <button className={`image-list-row ${selected === job.id ? "selected" : ""}`} key={job.id} onClick={() => onSelect(job)}><span className={`status-dot ${job.status.toLowerCase()}`} /><span className="image-name"><strong>{job.originalFilename}</strong><small>{job.stage ?? "Waiting"} · {job.progress}%</small></span>{needsReview(job) && <span className="review-pill">Review</span>}<span className="row-status">{job.status}</span></button>)}</div>;
}
