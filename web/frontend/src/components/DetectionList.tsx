/**
 * Detailed detection inspector listing individual bounding boxes, confidence scores, and review flags.
 */
import { Detection } from "../types";

export interface DetectionListProps {
  detections: Detection[];
}

/**
 * Renders detection rows with bounding boxes and model telemetry for the selected image.
 */
export function DetectionList({ detections }: DetectionListProps) {
  if (!detections.length) {
    return <div className="empty-inline">No detection details were returned for this image.</div>;
  }

  return (
    <div className="detection-list">
      {detections.map((detection, index) => {
        const hasWarning = detection.reviewReasons.length > 0;
        const rowClass = `detection-row ${hasWarning ? "warning-row" : ""}`.trim();
        const confText = detection.confidence === null ? "—" : `${Math.round(detection.confidence * 100)}%`;
        const redactedText = detection.redacted === null ? "—" : detection.redacted ? "yes" : "no";
        const whitelistedText = detection.whitelisted === null ? "—" : detection.whitelisted ? "yes" : "no";
        const similarityText = detection.similarity === null ? "—" : detection.similarity.toFixed(2);
        const refText = detection.whitelistRef === null ? "—" : String(detection.whitelistRef);

        return (
          <div className={rowClass} key={`${detection.label}-${index}`}>
            <div>
              <strong>{detection.label ?? "Unknown"}</strong>
              <small>{detection.box ? `Box: [${detection.box.join(", ")}]` : "Box unavailable"}</small>
              <small>
                {detection.reviewReasons.length > 0 ? detection.reviewReasons.join(" · ") : "No review flags"}
              </small>
            </div>
            <span>Confidence {confText}</span>
            <span>Redacted {redactedText}</span>
            <span>Whitelisted {whitelistedText}</span>
            <span>Similarity {similarityText}</span>
            <span>Whitelist ref {refText}</span>
            <span>lowConfidence {detection.lowConfidence === null ? "—" : String(detection.lowConfidence)}</span>
            <span>needsReview {detection.needsReview === null ? "—" : String(detection.needsReview)}</span>
            {hasWarning && <span className="warning-text">Needs review</span>}
          </div>
        );
      })}
    </div>
  );
}
