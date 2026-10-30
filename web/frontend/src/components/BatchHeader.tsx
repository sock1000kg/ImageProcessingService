import { Batch } from "../types";
type Props = { batch: Batch; onDelete: () => void };
export function BatchHeader({ batch, onDelete }: Props) {
  const completed = batch.jobs.filter((job) => job.status === "COMPLETED").length;
  const progress = batch.jobs.length ? Math.round(batch.jobs.reduce((sum, job) => sum + job.progress, 0) / batch.jobs.length) : 0;
  return <div className="batch-header"><div><span className="section-kicker">ACTIVE BATCH</span><h2>{batch.id}</h2><p>Created {new Date(batch.createdAt).toLocaleString()}</p></div><div className="batch-header-meta"><span className={`status ${batch.status.toLowerCase()}`}>{batch.status}</span><strong>{completed}/{batch.jobs.length} complete</strong><span>{progress}% overall</span><button className="danger-button" onClick={onDelete}>Delete batch</button></div></div>;
}
