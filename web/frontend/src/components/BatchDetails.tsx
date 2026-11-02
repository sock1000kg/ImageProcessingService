/**
 * Comprehensive batch workspace view displaying header, image navigator, viewer, and report.
 */
import { useEffect, useMemo, useState } from "react";
import { getBatchReport, retryJob } from "../api";
import { Batch, BatchReport as Report, Job } from "../types";
import { BatchHeader } from "./BatchHeader";
import { BatchImageList } from "./BatchImageList";
import { BatchReport } from "./BatchReport";
import { DeleteBatchDialog } from "./DeleteBatchDialog";
import { ImageResultViewer } from "./ImageResultViewer";

const BATCH_TTL_MS = 24 * 60 * 60 * 1000;

function getExpiryLabel(createdAt: string): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "Automatic deletion time is unavailable.";
  const expiresAt = new Date(created.getTime() + BATCH_TTL_MS);
  if (expiresAt.getTime() <= Date.now()) {
    return `Data expired on ${expiresAt.toLocaleString()}.`;
  }
  return `Data will be automatically deleted on ${expiresAt.toLocaleString()}.`;
}

export interface BatchDetailsProps {
  batch: Batch;
  onRefresh: () => Promise<void>;
  onDelete: () => Promise<void> | void;
  onMessage: (message: string) => void;
}

/**
 * Coordinates batch sub-views including report fetching, retry dispatching, and deletion confirmation.
 */
export function BatchDetails({ batch, onRefresh, onDelete, onMessage }: BatchDetailsProps) {
  const [selectedId, setSelectedId] = useState(batch.jobs[0]?.id ?? null);
  const [report, setReport] = useState<Report | null>(null);
  const [confirm, setConfirm] = useState(false);

  const selected = useMemo(
    () => batch.jobs.find((job) => job.id === selectedId) ?? batch.jobs[0],
    [batch.jobs, selectedId],
  );

  useEffect(() => {
    void getBatchReport(batch.id)
      .then((response) => setReport(response.report))
      .catch(() => setReport(null));
  }, [batch.id, batch.jobs]);

  const retry = async (job: Job) => {
    try {
      await retryJob(job.id);
      onMessage("Retry queued");
      await onRefresh();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Retry failed");
    }
  };

  const selectedReport = report?.images.find((item) => item.jobId === selected?.id);
  const detections = selectedReport?.detections ?? [];
  const hasWhitelist = Boolean(batch.whitelistKeys && batch.whitelistKeys.length > 0);
  const downloadableJobs = batch.jobs.filter((job) => job.status === "COMPLETED" && job.resultUrl);
  const [downloadMessage, setDownloadMessage] = useState("");

  const handleDownloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${batch.id}-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = async () => {
    if (!downloadableJobs.length) {
      setDownloadMessage("No completed results are available to download.");
      return;
    }
    setDownloadMessage(`Starting ${downloadableJobs.length} result download(s)…`);
    for (const job of downloadableJobs) {
      const link = document.createElement("a");
      link.href = job.resultUrl!;
      link.download = job.originalFilename;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    setDownloadMessage(`${downloadableJobs.length} result download(s) started.`);
  };

  return (
    <section className="details-card">
      <BatchHeader batch={batch} onDelete={() => setConfirm(true)} onBatchUpdated={() => void onRefresh()} />

      <div className="details-layout">
        <div>
          <BatchImageList
            batch={batch}
            report={report?.images ?? []}
            selected={selected?.id ?? null}
            onSelect={(job) => setSelectedId(job.id)}
          />
          <div className="ttl-note">{getExpiryLabel(batch.createdAt)}</div>
        </div>

        <div>
          {selected && (
            <ImageResultViewer
              job={selected}
              detections={detections}
              reviewReasons={selectedReport?.reviewReasons ?? []}
              hasWhitelist={hasWhitelist}
              onRetry={(job) => void retry(job)}
            />
          )}
        </div>

        <div className="report-card details-report-card">
          <div className="section-kicker">BATCH REPORT</div>
          <BatchReport report={report} onSelectImage={(jobId) => setSelectedId(jobId)} />
          <div className="report-downloads">
            <button type="button" className="secondary-button" onClick={() => void handleDownloadAll()}>
              Download all results ({downloadableJobs.length})
            </button>
            {downloadMessage && <span role="status">{downloadMessage}</span>}
          </div>
          <button type="button" className="secondary-button" onClick={handleDownloadReport} disabled={!report}>
            Download JSON report
          </button>
        </div>
      </div>

      <DeleteBatchDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void onDelete();
        }}
      />
    </section>
  );
}
