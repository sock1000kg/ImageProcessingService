/**
 * Comprehensive batch workspace view displaying header, image navigator, viewer, and report.
 */
import { useEffect, useMemo, useState } from "react";
import { getBatchReport, getBatchZipUrl, retryJob } from "../api";
import { Batch, BatchReport as Report, Job } from "../types";
import { BatchHeader } from "./BatchHeader";
import { BatchImageList } from "./BatchImageList";
import { BatchReport } from "./BatchReport";
import { DeleteBatchDialog } from "./DeleteBatchDialog";
import { ImageResultViewer } from "./ImageResultViewer";

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
  const completedJobs = useMemo(() => batch.jobs.filter((job) => job.status === "COMPLETED"), [batch.jobs]);

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

  const handleDownloadZip = async () => {
    if (completedJobs.length === 0) {
      onMessage("No completed results are available to download.");
      return;
    }
    try {
      const url = await getBatchZipUrl(batch.id);
      window.location.href = url;
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Failed to start zip download");
    }
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
            onJobDeleted={() => void onRefresh()}
            onError={onMessage}
          />
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
            <button
              type="button"
              className="secondary-button"
              disabled={completedJobs.length === 0}
              onClick={() => void handleDownloadZip()}
            >
              Download zip ({completedJobs.length})
            </button>
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
