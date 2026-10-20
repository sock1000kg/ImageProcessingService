import { Job } from "../types";
import { JobCard } from "./JobCard";

export function JobList({ jobs, filtered = false }: { jobs: Job[]; filtered?: boolean }) {
  return jobs.length === 0
    ? <div className="empty-state"><span className="empty-icon">{filtered ? "⌕" : "✦"}</span><strong>{filtered ? "No matching jobs" : "Your workspace is ready"}</strong><p>{filtered ? "Try another search or status filter." : "Upload an image above to create your first transformation."}</p></div>
    : <div className="jobs">{jobs.map((job) => <JobCard job={job} key={job.id} />)}</div>;
}
