/**
 * Detailed detection inspector listing individual bounding boxes, confidence scores, and review flags.
 */
import { Detection } from "../types";
import { StatusBadge } from "./ui/StatusBadge";

export interface DetectionListProps {
  detections: Detection[];
  hasWhitelist?: boolean;
  hoveredIndex?: number | null;
  onHoverDetection?: (index: number | null) => void;
}

/**
 * Normalises raw model label strings into readable human titles.
 */
export function formatDetectionLabel(label: string | null): string {
  if (!label) return "Unknown";
  const lower = label.trim().toLowerCase();
  if (lower === "face") return "Face";
  if (lower === "plate") return "Licence plate";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Formats detection action and biometric whitelist match status in words.
 */
export function formatDetectionStatus(detection: Detection): string {
  if (detection.whitelisted) {
    if (detection.whitelistRef !== null && detection.whitelistRef !== undefined) {
      return `Kept (whitelist person #${detection.whitelistRef + 1})`;
    }
    return "Kept (whitelisted)";
  }
  if (detection.redacted) {
    return "Redacted";
  }
  return "Kept";
}

/**
 * Renders human-readable detection rows with status badges and model telemetry for the selected image.
 */
export function DetectionList({
  detections,
  hasWhitelist = false,
  hoveredIndex = null,
  onHoverDetection,
}: DetectionListProps) {
  if (!detections.length) {
    return <div className="empty-inline">No detection details were returned for this image.</div>;
  }

  return (
    <div className="detection-list scroll-list">
      {detections.map((detection, index) => {
        const isFlagged =
          Boolean(detection.needsReview) ||
          Boolean(detection.lowConfidence) ||
          (detection.reviewReasons && detection.reviewReasons.length > 0);
        const isHovered = hoveredIndex === index;
        const rowClass = `detection-row ${isFlagged ? "warning-row" : ""} ${isHovered ? "active-row" : ""}`.trim();
        const confText = detection.confidence === null ? "—" : `${Math.round(detection.confidence * 100)}%`;
        const labelInWords = formatDetectionLabel(detection.label);
        const statusText = formatDetectionStatus(detection);
        const reviewNotesText =
          detection.reviewNotes && detection.reviewNotes.length > 0
            ? detection.reviewNotes.join(" · ")
            : detection.reviewReasons && detection.reviewReasons.length > 0
              ? detection.reviewReasons.join(" · ")
              : null;

        return (
          <div
            className={rowClass}
            key={`${detection.label}-${index}`}
            tabIndex={0}
            onMouseEnter={() => onHoverDetection?.(index)}
            onMouseLeave={() => onHoverDetection?.(null)}
            onFocus={() => onHoverDetection?.(index)}
            onBlur={() => onHoverDetection?.(null)}
          >
            <div className="detection-main">
              <span className="detection-summary">
                #{index + 1} {labelInWords} {confText} {statusText}
              </span>
              {hasWhitelist && typeof detection.similarity === "number" && (
                <span className="detection-similarity">Similarity {detection.similarity.toFixed(2)}</span>
              )}
              {reviewNotesText && <small className="detection-notes">{reviewNotesText}</small>}
            </div>
            {isFlagged && <StatusBadge variant="pill" label="Needs review" />}
          </div>
        );
      })}
    </div>
  );
}
