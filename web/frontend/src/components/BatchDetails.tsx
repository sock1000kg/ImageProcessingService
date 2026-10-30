import { useEffect, useMemo, useState } from "react";
import { getBatchReport, retryJob } from "../api";
import { Batch, BatchReport as Report, Job } from "../types";
import { BatchHeader } from "./BatchHeader";
import { BatchImageList } from "./BatchImageList";
import { BatchReport } from "./BatchReport";
import { DeleteBatchDialog } from "./DeleteBatchDialog";
import { ImageResultViewer } from "./ImageResultViewer";
type Props = { batch: Batch; onRefresh: () => Promise<void>; onDelete: () => Promise<void>; onMessage: (message: string) => void };
export function BatchDetails({ batch, onRefresh, onDelete, onMessage }: Props) {
  const [selectedId, setSelectedId] = useState(batch.jobs[0]?.id ?? null);
  const [report, setReport] = useState<Report | null>(null);
  const [confirm, setConfirm] = useState(false);
  const selected = useMemo(() => batch.jobs.find((job) => job.id === selectedId) ?? batch.jobs[0], [batch.jobs, selectedId]);
  useEffect(() => { void getBatchReport(batch.id).then((response) => setReport(response.report)).catch(() => setReport(null)); }, [batch.id, batch.jobs]);
  const retry = async (job: Job) => { try { await retryJob(job.id); onMessage("Retry queued"); await onRefresh(); } catch (error) { onMessage(error instanceof Error ? error.message : "Retry failed"); } };
  const selectedReport = report?.images.find((item) => item.jobId === selected?.id);
  const detections = selectedReport?.detections ?? [];
  return <section className="details-card"><BatchHeader batch={batch} onDelete={() => setConfirm(true)} /><div className="details-layout"><div><BatchImageList batch={batch} report={report?.images ?? []} selected={selected?.id ?? null} onSelect={(job) => setSelectedId(job.id)} /><div className="ttl-note">Files are automatically removed after 24 hours.</div></div><div>{selected && <ImageResultViewer job={selected} detections={detections} reviewReasons={selectedReport?.reviewReasons ?? []} onRetry={(job) => void retry(job)} />}<div className="report-card"><div className="section-kicker">BATCH REPORT</div><BatchReport report={report} /><button className="secondary-button" onClick={() => { if (report) { const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${batch.id}-report.json`; link.click(); URL.revokeObjectURL(url); } }} disabled={!report}>Download JSON report</button></div></div></div><DeleteBatchDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void onDelete(); }} /></section>;
}
