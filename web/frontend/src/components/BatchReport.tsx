/**
 * Batch report presentation component displaying detection aggregate totals and flagged review images.
 */
import React from "react";
import { BatchReport as Report } from "../types";
import { Banner } from "./ui/Banner";
import { StatTile } from "./ui/StatTile";

export interface BatchReportProps {
  report: Report | null;
  onSelectImage?: (jobId: string) => void;
}

/**
 * Formats aggregate detection metrics and lists images requiring manual verification.
 */
export function BatchReport({ report, onSelectImage }: BatchReportProps) {
  if (!report) {
    return <div className="empty-inline">Report is not available yet.</div>;
  }

  const items: Array<[string, number]> = [
    ["Faces", report.totals.faces],
    ["Plates", report.totals.plates],
    ["Redacted", report.totals.redacted],
    ["Whitelisted", report.totals.whitelisted],
    ["Low confidence", report.totals.lowConfidence],
    ["Images needing review", report.reviewImages.length],
    ["Detections needing review", report.reviewDetections.length],
  ];

  return (
    <div className="report-panel">
      <div className="report-metrics">
        {items.map(([label, value]) => (
          <StatTile key={label} label={label} value={value} />
        ))}
      </div>

      {report.reviewImages.length > 0 ? (
        <div className="review-report-list scroll-list">
          <Banner variant="warning">{report.reviewImages.length} image(s) need review.</Banner>
          {report.reviewImages.map((image) => {
            const notes =
              image.reviewNotes && image.reviewNotes.length > 0
                ? image.reviewNotes.join(" · ")
                : image.reviewReasons.join(" · ");

            return (
              <div
                className={`review-report-item ${onSelectImage ? "clickable" : ""}`.trim()}
                key={image.jobId}
                role={onSelectImage ? "button" : undefined}
                tabIndex={onSelectImage ? 0 : undefined}
                onClick={() => onSelectImage?.(image.jobId)}
                onKeyDown={(e) => {
                  if (onSelectImage && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelectImage(image.jobId);
                  }
                }}
              >
                <strong>{image.originalFilename}</strong>
                <span>{notes}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <Banner variant="success">No images need review.</Banner>
      )}
      <div className="report-section">
        <h4>Whitelist people</h4>
        {report.whitelistPeople && report.whitelistPeople.length > 0 ? (
          report.whitelistPeople.map((person) => (
            <div className="whitelist-person" key={person.whitelistRef}>
              <strong>Whitelist #{person.whitelistRef + 1}</strong>
              <span>
                {person.imageCount} image(s), {person.detectionCount} detection(s)
              </span>
              {person.imageCount > 0 && (
                <small>{person.images.map((image) => image.originalFilename).join(", ")}</small>
              )}
            </div>
          ))
        ) : (
          <div className="empty-inline">No whitelist detections were returned by the Engine.</div>
        )}
      </div>
    </div>
  );
}
