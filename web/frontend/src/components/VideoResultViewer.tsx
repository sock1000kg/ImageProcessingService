import { useRef, useState, type ReactNode } from "react";
import { ArrowSquareOutIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { downloadJobResult, openJobOriginal } from "../api";
import { Detection, Job } from "../types";
import { usePresignedUrl } from "../hooks/usePresignedUrl";
import { formatJobErrorMessage } from "../utils/format";
import { formatDetectionLabel } from "./DetectionList";

/**
 * Shows one video job: the redacted video once it finishes, otherwise its processing state.
 *
 * Why the shared viewer classes: `.result-viewer` / `.viewer-empty` give the pane the same height as the image
 * viewer, which keeps the file list column beside it from collapsing while the video is still processing.
 */
export function VideoResultViewer({
  job,
  detections = [],
  onRetry,
}: {
  job: Job;
  detections?: Detection[];
  onRetry: (job: Job) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // The flagged track whose box is drawn on the video. Only valid while paused on its frame, see seekTo.
  const [focused, setFocused] = useState<Detection | null>(null);
  const completed = job.status === "COMPLETED";
  const { url, loading, error } = usePresignedUrl(completed ? `/api/jobs/${job.id}/result-url` : null);
  const summary = readSummary(job);

  // Tracks the review rules flagged (low confidence, or a gap where the redaction may have been lost), in time order.
  const reviewTracks = detections
    .filter((track) => track.reviewReasons.length > 0 && track.trackId !== undefined)
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  // The Engine keeps one box per track, measured at `bestFrameMs`. Elsewhere in the track the person has moved, so
  // the box is only drawn while the video is paused on that frame and is dropped as soon as playback resumes.
  const showTrack = (track: Detection) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause?.();
    video.currentTime = (track.bestFrameMs ?? track.startMs ?? 0) / 1000;
    setFocused(track);
  };

  let stage: ReactNode;
  if (completed && url) {
    stage = (
      <div className="comparison">
        <div
          className="video-frame"
          style={summary.size ? { aspectRatio: `${summary.size.width} / ${summary.size.height}` } : undefined}
        >
          <video
            ref={videoRef}
            onPlay={() => setFocused(null)}
            controls
            preload="metadata"
            src={url}
            aria-label={`Redacted ${job.originalFilename}`}
          >
            Your browser does not support video playback.
          </video>
          {focused?.box && summary.size && (
            <svg
              className="video-box-overlay"
              viewBox={`0 0 ${summary.size.width} ${summary.size.height}`}
              aria-hidden="true"
            >
              <rect
                x={focused.box[0]}
                y={focused.box[1]}
                width={focused.box[2] - focused.box[0]}
                height={focused.box[3] - focused.box[1]}
              />
            </svg>
          )}
        </div>
      </div>
    );
  } else if (job.status === "FAILED") {
    stage = (
      <div className="viewer-empty">
        <strong>This video failed processing.</strong>
        {job.error && (
          <p className="failure-detail">
            {job.error.code && <span className="failure-code">{job.error.code}</span>}
            {job.error.code && formatJobErrorMessage(job.error) ? ": " : ""}
            {formatJobErrorMessage(job.error)}
          </p>
        )}
      </div>
    );
  } else if (completed) {
    stage = (
      <div className="viewer-empty">{loading && !error ? "Loading video result…" : "Video result is unavailable."}</div>
    );
  } else {
    stage = <div className="viewer-empty">Result will appear here when processing completes.</div>;
  }

  return (
    <div className="result-viewer">
      <div className="viewer-head">
        <div>
          <span className="section-kicker">VIDEO RESULT</span>
          <h3>{job.originalFilename}</h3>
        </div>
        <div className="result-actions">
          {job.status === "FAILED" && (
            <button type="button" className="secondary-button" onClick={() => onRetry(job)}>
              Retry job
            </button>
          )}
        </div>
      </div>
      {stage}
      <div className="viewer-meta">
        <span>
          {job.stage ?? "Waiting"} · {job.progress}%
        </span>
        {completed && (
          <>
            <a
              href="#"
              className="ghost-button"
              onClick={(event) => {
                event.preventDefault();
                void openJobOriginal(job.id);
              }}
            >
              <ArrowSquareOutIcon aria-hidden="true" />
              Open original
            </a>
            <button type="button" className="ghost-button" onClick={() => void downloadJobResult(job.id)}>
              <DownloadSimpleIcon aria-hidden="true" />
              Download result
            </button>
          </>
        )}
        {summary.details && <span>{summary.details}</span>}
      </div>
      {reviewTracks.length > 0 && (
        <section className="report-section" aria-label="Needs review">
          <h4>Needs review</h4>
          <ul className="video-review-list">
            {reviewTracks.map((track) => (
              <li key={track.trackId}>
                <button type="button" className="ghost-button" onClick={() => showTrack(track)}>
                  {formatDetectionLabel(track.label)} · {formatClock(track.startMs ?? 0)}–
                  {formatClock(track.endMs ?? 0)}
                </button>
                <small>{(track.reviewNotes ?? track.reviewReasons).join(" · ")}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {summary.counts.length > 0 && (
        <div className="report-metrics">
          {[...summary.counts, ...(completed ? [["Needs review", reviewTracks.length] as [string, number]] : [])].map(
            ([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

const COUNT_LABELS: Array<[string, string]> = [
  ["faceTracks", "Face tracks"],
  ["plateTracks", "Plate tracks"],
  ["redactedTracks", "Redacted"],
  ["whitelistedFaceTracks", "Allow-listed faces"],
  ["whitelistedPlateTracks", "Allow-listed plates"],
];

/**
 * Turns the Engine's video summary into one line of video details and a few labelled counts. The per-track list
 * stays out of the page: a street video easily has hundreds of tracks and it is not readable as raw data.
 */
function readSummary(job: Job): {
  details: string;
  size: { width: number; height: number } | null;
  counts: Array<[string, number]>;
} {
  const summary = job.resultSummary ?? {};
  const video = (summary.video ?? {}) as Record<string, unknown>;
  const counts = (summary.counts ?? {}) as Record<string, unknown>;

  const parts: string[] = [];
  if (typeof video.width === "number" && typeof video.height === "number") parts.push(`${video.width}×${video.height}`);
  if (typeof video.fps === "number") parts.push(`${Math.round(video.fps * 100) / 100} fps`);
  if (typeof video.durationMs === "number") parts.push(`${(video.durationMs / 1000).toFixed(1)} s`);

  const size =
    typeof video.width === "number" && typeof video.height === "number"
      ? { width: video.width, height: video.height }
      : null;

  return {
    size,
    details: parts.join(" · "),
    counts: COUNT_LABELS.flatMap(([key, label]): Array<[string, number]> =>
      typeof counts[key] === "number" ? [[label, counts[key] as number]] : [],
    ),
  };
}

function formatClock(ms: number): string {
  const tenths = Math.floor(ms / 100);
  return `${Math.floor(tenths / 600)}:${String(Math.floor((tenths % 600) / 10)).padStart(2, "0")}.${tenths % 10}`;
}
