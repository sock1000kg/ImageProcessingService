import { Job } from "../types";

const statusLabel: Record<string, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatBytes(value: unknown): string {
  if (typeof value !== "number") return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(value: unknown): string {
  return typeof value === "number" ? `${value} ms` : "—";
}

function ResultSummary({ job }: { job: Job }) {
  const summary = job.resultSummary;
  if (!summary) return null;
  if (job.type === "object-detection") {
    const labels = Array.isArray(summary.labels) ? summary.labels.join(", ") : "No objects detected";
    return <div className="summary-grid"><div><span>Objects detected</span><strong>{String(summary.objectsDetected ?? 0)}</strong></div><div><span>Labels</span><strong>{labels}</strong></div><div><span>Processing time</span><strong>{formatDuration(summary.processingTimeMs)}</strong></div></div>;
  }
  return <div className="summary-grid"><div><span>Format</span><strong>{String(summary.originalFormat ?? "—")} → {String(summary.targetFormat ?? "—")}</strong></div><div><span>Dimensions</span><strong>{String(summary.originalDimensions ?? "—")} → {String(summary.outputDimensions ?? "—")}</strong></div><div><span>Size</span><strong>{formatBytes(summary.originalSizeBytes)} → {formatBytes(summary.outputSizeBytes)}</strong></div></div>;
}

export function JobCard({ job }: { job: Job }) {
  return <article className="job">
    <div className="job-top"><strong>{job.originalFilename}</strong><span className={`status ${job.status.toLowerCase()}`}>{statusLabel[job.status] ?? job.status}</span></div>
    <p className="job-id"><span className="type-chip">{job.type === "object-detection" ? "AI detection" : "Image convert"}</span><span className="job-id-text">{job.id}</span><span className="job-date">{formatDate(job.createdAt)}</span></p>
    {job.status === "COMPLETED" && job.resultUrl && <div className="result-preview">
      <img src={job.resultUrl} alt={`Processed result for ${job.originalFilename}`} loading="lazy" />
      <div className="result-overlay">Processed result</div>
    </div>}
    <div className="progress"><span style={{ width: `${job.progress}%` }} /></div>
    <div className="job-bottom"><span>{job.stage ?? "Waiting"} · {job.progress}%</span>{job.resultUrl && <a href={job.resultUrl} download target="_blank" rel="noreferrer">View / download result</a>}</div>
    {job.error && <p className="error">{job.error.code}: {job.error.message}</p>}
    {job.status === "COMPLETED" && <ResultSummary job={job} />}
    {job.resultSummary && <details><summary>Technical result</summary><pre>{JSON.stringify(job.resultSummary, null, 2)}</pre></details>}
  </article>;
}
