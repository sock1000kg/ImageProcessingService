import { useMemo, useRef } from "react";
import { Job } from "../types";
import { usePresignedUrl } from "../hooks/usePresignedUrl";

export function VideoResultViewer({ job }: { job: Job }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const completed = job.status === "COMPLETED";
  const { url, loading, error } = usePresignedUrl(completed ? `/api/jobs/${job.id}/result-url` : null);
  const summary = job.resultSummary?.video;
  const tracks = useMemo(() => (Array.isArray(job.resultSummary?.tracks) ? job.resultSummary.tracks : []), [job]);

  if (!completed) {
    return (
      <div className="result-viewer-empty">
        {job.status === "FAILED" ? "Video processing failed." : `Video ${job.status.toLowerCase()} (${job.progress}%).`}
      </div>
    );
  }
  if (loading) return <div className="result-viewer-empty">Loading video result…</div>;
  if (error || !url) return <div className="result-viewer-empty">Video result is unavailable.</div>;

  return (
    <div className="result-viewer">
      <video ref={videoRef} controls preload="metadata" src={url} style={{ maxWidth: "100%" }}>
        Your browser does not support video playback.
      </video>
      {summary !== undefined && summary !== null && typeof summary === "object" && (
        <dl className="result-metadata">
          {Object.entries(summary as Record<string, unknown>).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {tracks.length > 0 && (
        <div>
          <strong>Tracks</strong>
          <ul>
            {tracks.map((track, index) => (
              <li key={index}>{JSON.stringify(track)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
