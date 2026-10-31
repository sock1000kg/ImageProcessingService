/**
 * Interactive before-and-after image comparator and detection telemetry viewer.
 */
import { useState } from "react";
import { Detection, Job, ReviewReason } from "../types";
import { DetectionList } from "./DetectionList";
import { StatusBadge } from "./ui/StatusBadge";

export interface ImageResultViewerProps {
  job: Job;
  detections: Detection[];
  reviewReasons: ReviewReason[];
  onRetry: (job: Job) => void;
}

/**
 * Displays original vs redacted image comparison slider and detection findings.
 */
export function ImageResultViewer({ job, detections, reviewReasons, onRetry }: ImageResultViewerProps) {
  const [split, setSplit] = useState(50);

  return (
    <div className="result-viewer">
      <div className="viewer-head">
        <div>
          <span className="section-kicker">IMAGE RESULT</span>
          <h3>{job.originalFilename}</h3>
          {reviewReasons.length > 0 && (
            <div className="review-reasons">
              <StatusBadge variant="pill" label="Needs review" />
              {reviewReasons.map((reason) => (
                <small key={reason}>{reason}</small>
              ))}
            </div>
          )}
        </div>
        {job.status === "FAILED" && (
          <button type="button" className="secondary-button" onClick={() => onRetry(job)}>
            Retry job
          </button>
        )}
      </div>

      {job.status === "COMPLETED" && job.resultUrl ? (
        <>
          <div className="comparison">
            <img className="comparison-after" src={job.resultUrl} alt={`Processed ${job.originalFilename}`} />
            <div className="comparison-before" style={{ width: `${split}%` }}>
              <img src={`/api/jobs/${job.id}/original`} alt={`Original ${job.originalFilename}`} />
            </div>
            <div className="comparison-divider" style={{ left: `${split}%` }} />
          </div>
          <label className="slider-label">
            Before / after
            <input
              type="range"
              min="0"
              max="100"
              value={split}
              onChange={(event) => setSplit(Number(event.target.value))}
            />
          </label>
        </>
      ) : (
        <div className="viewer-empty">
          {job.status === "FAILED"
            ? "This image failed processing."
            : "Result will appear here when processing completes."}
        </div>
      )}

      <div className="viewer-meta">
        <span>
          {job.stage ?? "Waiting"} · {job.progress}%
        </span>
        <a href={`/api/jobs/${job.id}/original`} target="_blank" rel="noreferrer">
          Open original
        </a>
        {job.resultUrl && (
          <a href={job.resultUrl} download target="_blank" rel="noreferrer">
            Download result
          </a>
        )}
      </div>

      <DetectionList detections={detections} />
    </div>
  );
}
