import { Job } from "../types";

const statusLabel: Record<string, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ResultSummary({ job }: { job: Job }) {
  const summary = job.resultSummary;
  if (!summary) return null;

  const counts = summary.counts as Record<string, number> | undefined;
  if (counts) {
    return (
      <div className="summary-grid">
        <div>
          <span>Redacted</span>
          <strong>{String(counts.redacted ?? 0)}</strong>
        </div>
        <div>
          <span>Faces / Plates</span>
          <strong>
            {String(counts.face ?? 0)} / {String(counts.plate ?? 0)}
          </strong>
        </div>
        <div>
          <span>Whitelisted</span>
          <strong>{String(counts.whitelistedFace ?? counts.whitelisted ?? 0)}</strong>
        </div>
        {counts.lowConfidence ? (
          <div>
            <span>Low confidence</span>
            <strong>{String(counts.lowConfidence)}</strong>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <details>
      <summary>Technical result</summary>
      <pre>{JSON.stringify(job.resultSummary, null, 2)}</pre>
    </details>
  );
}

export function JobCard({ job }: { job: Job }) {
  return (
    <article className="job">
      <div className="job-top">
        <strong>{job.originalFilename}</strong>
        <span className={`status ${job.status.toLowerCase()}`}>
          {statusLabel[job.status] ?? job.status}
        </span>
      </div>
      <p className="job-id">
        <span className="type-chip">Redact</span>
        <span className="job-id-text">{job.id}</span>
        <span className="job-date">{formatDate(job.createdAt)}</span>
      </p>

      {job.status === "COMPLETED" && job.resultUrl && (
        <div className="result-preview">
          <img src={job.resultUrl} alt={`Processed result for ${job.originalFilename}`} loading="lazy" />
          <div className="result-overlay">Processed result</div>
        </div>
      )}

      <div className="progress">
        <span style={{ width: `${job.progress}%` }} />
      </div>

      <div className="job-bottom">
        <span>{job.stage ?? "Waiting"} · {job.progress}%</span>
        <div style={{ display: "flex", gap: "1rem" }}>
          <a href={`/api/jobs/${job.id}/original`} target="_blank" rel="noreferrer">
            View original
          </a>
          {job.resultUrl && (
            <a href={job.resultUrl} download target="_blank" rel="noreferrer">
              Download result
            </a>
          )}
        </div>
      </div>

      {job.error && <p className="error">{job.error.code}: {job.error.message}</p>}
      {job.status === "COMPLETED" && <ResultSummary job={job} />}
    </article>
  );
}
