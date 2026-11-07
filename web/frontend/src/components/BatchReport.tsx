/**
 * Batch report presentation component displaying detection aggregate totals and flagged review images.
 */
import React, { useEffect, useState } from "react";
import { BatchReport as Report, ReportWhitelistPerson } from "../types";
import { Banner } from "./ui/Banner";
import { StatTile } from "./ui/StatTile";
import { usePrivateImage } from "../hooks/usePrivateImage";

export interface BatchReportProps {
  report: Report | null;
  onSelectImage?: (jobId: string) => void;
}

/**
 * Props for {@link ReportImageItem}.
 */
export interface ReportImageItemProps {
  /** The primary display title of the image (e.g. filename). */
  title: string;
  /** Optional supplementary details or notes shown alongside the title. */
  detail?: string;
  /** Selection handler invoked when the item is clicked or activated via keyboard. */
  onSelect?: () => void;
}

/**
 * Clickable row representing a batch image in report sections (such as review candidates
 * or whitelist matched images), providing keyboard and mouse selection into the batch viewer.
 */
export function ReportImageItem({ title, detail, onSelect }: ReportImageItemProps) {
  return (
    <div
      className={`review-report-item ${onSelect ? "clickable" : ""}`.trim()}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

interface WhitelistPersonThumbnailProps {
  batchId: string;
  n: number;
  label: string;
}

/**
 * Thumbnail rendering for a whitelisted person's enrolled reference image.
 *
 * Why fallback placeholder: Uploaded whitelist files are deleted upon batch completion, or an allow list
 * reference photo may have been purged, in which case a neutral placeholder is shown instead of a broken img.
 */
function WhitelistPersonThumbnail({ batchId, n, label }: WhitelistPersonThumbnailProps) {
  const { url, loading, error } = usePrivateImage(`/api/batches/${batchId}/whitelist/${n}`);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [url]);

  return (
    <div className="thumbnail-container">
      {loading || error || !url || imgError ? (
        <div className="thumbnail-placeholder" aria-hidden="true" />
      ) : (
        <img src={url} alt={label} onError={() => setImgError(true)} />
      )}
      <span className="thumbnail-badge">#{n}</span>
    </div>
  );
}

interface WhitelistPersonSectionProps {
  batchId: string;
  person: ReportWhitelistPerson;
  onSelectImage?: (jobId: string) => void;
}

/**
 * Expandable person card summarizing detections of a single whitelisted reference photo.
 *
 * Why collapsed by default: Whitelist sections can contain many reference candidates; keeping them
 * collapsed keeps the overview compact and uncluttered.
 * Why plain div when 0 images: If there are no images to show, providing an expand/collapse toggle
 * is misleading and creates unnecessary interactive noise.
 */
function WhitelistPersonSection({ batchId, person, onSelectImage }: WhitelistPersonSectionProps) {
  const [open, setOpen] = useState(false);
  const n = person.whitelistRef + 1;
  const label = person.name && person.name.trim().length > 0 ? person.name : `Allow list #${n}`;
  const hasImages = Boolean(person.images && person.images.length > 0);

  const headerContent = (
    <>
      <WhitelistPersonThumbnail batchId={batchId} n={n} label={label} />
      <div className="file-row-info">
        <strong>{label}</strong>
        <span>
          {person.imageCount} image(s), {person.detectionCount} detection(s)
        </span>
      </div>
      {hasImages && (
        <span className={`chevron ${open ? "open" : ""}`} aria-hidden="true">
          ▾
        </span>
      )}
    </>
  );

  return (
    <div className="whitelist-person">
      {hasImages ? (
        <button
          type="button"
          className="file-row whitelist-person-button"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          {headerContent}
        </button>
      ) : (
        <div className="file-row whitelist-person-row">{headerContent}</div>
      )}

      {open && hasImages && (
        <div className="review-report-list scroll-list">
          {person.images.map((image) => (
            <ReportImageItem
              key={image.jobId}
              title={image.originalFilename}
              onSelect={onSelectImage ? () => onSelectImage(image.jobId) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
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
    ["Allow-listed", report.totals.whitelisted],
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
        <section className="review-report-list scroll-list" aria-label="Review candidates">
          <Banner variant="warning">{report.reviewImages.length} image(s) need review.</Banner>
          {report.reviewImages.map((image) => {
            const notes =
              image.reviewNotes && image.reviewNotes.length > 0
                ? image.reviewNotes.join(" · ")
                : image.reviewReasons.join(" · ");

            return (
              <ReportImageItem
                key={image.jobId}
                title={image.originalFilename}
                detail={notes}
                onSelect={onSelectImage ? () => onSelectImage(image.jobId) : undefined}
              />
            );
          })}
        </section>
      ) : (
        <Banner variant="success">No images need review.</Banner>
      )}
      <section className="report-section" aria-label="Allow list people">
        <h4>Allow list people</h4>
        {report.whitelistPeople && report.whitelistPeople.length > 0 ? (
          report.whitelistPeople.map((person) => (
            <WhitelistPersonSection
              key={person.whitelistRef}
              batchId={report.batchId}
              person={person}
              onSelectImage={onSelectImage}
            />
          ))
        ) : (
          <div className="empty-inline">No allow list detections were returned by the Engine.</div>
        )}
      </section>
    </div>
  );
}
