/**
 * Interactive before-and-after image comparator and detection telemetry viewer.
 */
import { useEffect, useState } from "react";
import { Detection, Job, ReviewReason } from "../types";
import { DetectionList } from "./DetectionList";
import { boxToPercent, ImageStage } from "./ui/ImageStage";
import { StatusBadge } from "./ui/StatusBadge";

export interface ImageResultViewerProps {
  job: Job;
  detections: Detection[];
  reviewReasons: ReviewReason[];
  hasWhitelist?: boolean;
  onRetry: (job: Job) => void;
}

/**
 * Resolves natural dimensions using loaded event telemetry, summary metadata, or detection coordinates.
 */
function getEffectiveDimensions(
  naturalSize: { width: number; height: number } | null,
  job: Job,
  detections: Detection[],
): { width: number; height: number } | null {
  if (naturalSize && naturalSize.width > 0 && naturalSize.height > 0) {
    return naturalSize;
  }
  const summarySize = job.resultSummary?.imageSize;
  if (
    Array.isArray(summarySize) &&
    typeof summarySize[0] === "number" &&
    typeof summarySize[1] === "number" &&
    summarySize[0] > 0 &&
    summarySize[1] > 0
  ) {
    return { width: summarySize[0], height: summarySize[1] };
  }
  let maxX = 0;
  let maxY = 0;
  for (const d of detections) {
    if (d.box && d.box.length >= 4) {
      if (d.box[2] > maxX) maxX = d.box[2];
      if (d.box[3] > maxY) maxY = d.box[3];
    }
  }
  if (maxX > 0 && maxY > 0) {
    return { width: maxX, height: maxY };
  }
  return null;
}

/**
 * Displays original vs redacted image comparison slider and detection findings.
 */
export function ImageResultViewer({
  job,
  detections,
  reviewReasons,
  hasWhitelist = false,
  onRetry,
}: ImageResultViewerProps) {
  const [split, setSplit] = useState(50);
  const [showBoxes, setShowBoxes] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setNaturalSize(null);
  }, [job.id]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      setNaturalSize({ width: naturalWidth, height: naturalHeight });
    }
  };

  const effectiveSize = getEffectiveDimensions(naturalSize, job, detections);
  const isOverlayVisible = showBoxes || hoveredIndex !== null;

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
            <ImageStage naturalWidth={effectiveSize?.width} naturalHeight={effectiveSize?.height}>
              <img
                className="comparison-after"
                src={job.resultUrl}
                alt={`Processed ${job.originalFilename}`}
                onLoad={handleImageLoad}
              />
              <div className="comparison-before" style={{ clipPath: `inset(0 calc(100% - ${split}%) 0 0)` }}>
                <img
                  src={`/api/jobs/${job.id}/original`}
                  alt={`Original ${job.originalFilename}`}
                  onLoad={handleImageLoad}
                />
              </div>
              <div className="comparison-divider" style={{ left: `${split}%` }} />

              {isOverlayVisible && effectiveSize && (
                <div className="detection-overlay" data-testid="detection-overlay">
                  {detections.map((detection, index) => {
                    if (!detection.box || detection.box.length < 4) return null;
                    const isHovered = hoveredIndex === index;
                    if (!showBoxes && !isHovered) return null;

                    const { left, top, width, height } = boxToPercent(
                      detection.box,
                      effectiveSize.width,
                      effectiveSize.height,
                    );

                    const isFlagged =
                      Boolean(detection.needsReview) ||
                      Boolean(detection.lowConfidence) ||
                      (detection.reviewReasons && detection.reviewReasons.length > 0);
                    const isWhitelisted = Boolean(detection.whitelisted);

                    let variantClass = "detection-box-redacted";
                    if (isFlagged) {
                      variantClass = "detection-box-warning";
                    } else if (isWhitelisted) {
                      variantClass = "detection-box-whitelisted";
                    }

                    return (
                      <div
                        key={`box-${index}`}
                        className={`detection-box ${variantClass} ${isHovered ? "is-highlighted" : ""}`.trim()}
                        style={{
                          left: `${left}%`,
                          top: `${top}%`,
                          width: `${width}%`,
                          height: `${height}%`,
                        }}
                        data-testid={`detection-box-${index}`}
                      >
                        <span className="detection-box-label">#{index + 1}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ImageStage>
          </div>
          <div className="viewer-controls">
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
            <label className="overlay-toggle">
              <input type="checkbox" checked={showBoxes} onChange={(event) => setShowBoxes(event.target.checked)} />
              Show boxes
            </label>
          </div>
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

      <DetectionList
        detections={detections}
        hasWhitelist={hasWhitelist}
        hoveredIndex={hoveredIndex}
        onHoverDetection={setHoveredIndex}
      />
    </div>
  );
}
