import { BatchReport as Report } from "../types";
export function BatchReport({ report }: { report: Report | null }) {
  if (!report) return <div className="empty-inline">Report is not available yet.</div>;
  const items = [["Faces", report.totals.faces], ["Plates", report.totals.plates], ["Redacted", report.totals.redacted], ["Whitelisted", report.totals.whitelisted], ["Low confidence", report.totals.lowConfidence], ["Images needing review", report.reviewImages.length], ["Detections needing review", report.reviewDetections.length]];
  return <div className="report-panel"><div className="report-metrics">{items.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>{report.reviewImages.length > 0 ? <div className="review-report-list"><p className="warning-banner">{report.reviewImages.length} image(s) need review.</p>{report.reviewImages.map((image) => <div className="review-report-item" key={image.jobId}><strong>{image.originalFilename}</strong><span>{image.reviewReasons.join(" · ")}</span></div>)}</div> : <p className="success-banner">No images need review.</p>}</div>;
}
