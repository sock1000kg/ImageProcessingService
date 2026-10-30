import { BatchReport as Report } from "../types";
export function BatchReport({ report }: { report: Report | null }) {
  if (!report) return <div className="empty-inline">Report is not available yet.</div>;
  const items = [["Faces", report.totals.faces], ["Plates", report.totals.plates], ["Redacted", report.totals.redacted], ["Whitelisted", report.totals.whitelisted], ["Low confidence", report.totals.lowConfidence]];
  return <div className="report-panel"><div className="report-metrics">{items.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>{report.lowConfidenceDetections.length > 0 && <p className="warning-banner">{report.lowConfidenceDetections.length} detection(s) need review.</p>}</div>;
}
