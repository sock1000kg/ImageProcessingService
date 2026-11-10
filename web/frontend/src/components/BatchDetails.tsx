/**
 * Comprehensive batch workspace view displaying header, image navigator, viewer, and report.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, getBatchReport, getBatchZipUrl, retryJob, startBatch } from "../api";
import { Batch, BatchReport as Report, Detection, Job, MessageHandler } from "../types";
import { formatJobErrorMessage } from "../utils/format";
import { BatchHeader } from "./BatchHeader";
import { BatchImageList } from "./BatchImageList";
import { BatchReport } from "./BatchReport";
import { DeleteBatchDialog } from "./DeleteBatchDialog";
import { ImageResultViewer } from "./ImageResultViewer";
import { VideoResultViewer } from "./VideoResultViewer";
import { Banner } from "./ui/Banner";

export interface BatchDetailsProps {
  batch: Batch;
  onRefresh: () => Promise<void>;
  onDelete: () => Promise<void> | void;
  onMessage: MessageHandler;
}

/**
 * Coordinates batch sub-views including report fetching, retry dispatching, and deletion confirmation.
 */
export function BatchDetails({ batch, onRefresh, onDelete, onMessage }: BatchDetailsProps) {
  const navigate = useNavigate();
  const detailsLayoutRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState(batch.jobs[0]?.id ?? null);
  const [report, setReport] = useState<Report | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [missingFacesConfirm, setMissingFacesConfirm] = useState<{
    job: Job;
    missing: number;
    total: number;
  } | null>(null);
  const [starting, setStarting] = useState(false);

  const handleSelectReportImage = (jobId: string) => {
    setSelectedId(jobId);
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";
    detailsLayoutRef.current?.scrollIntoView?.({ behavior, block: "start" });
  };

  const isDraft = batch.status === "DRAFT" || !batch.startedAt;

  const selected = useMemo(
    () => batch.jobs.find((job) => job.id === selectedId) ?? batch.jobs[0],
    [batch.jobs, selectedId],
  );

  const jobsStatusKey = batch.jobs.map((job) => `${job.id}:${job.status}`).join(",");

  useEffect(() => {
    void getBatchReport(batch.id)
      .then((response) => setReport(response.report))
      .catch(() => setReport(null));
  }, [batch.id, jobsStatusKey]);

  const retry = async (job: Job, acceptMissingFaces = false) => {
    try {
      await retryJob(job.id, acceptMissingFaces ? { acceptMissingFaces: true } : undefined);
      onMessage("Retry queued");
      await onRefresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === "WHITELIST_FACES_MISSING") {
        const details = (error.details as { missing?: number; total?: number }) ?? {};
        const missing = details.missing ?? 1;
        const total = details.total ?? missing;
        setMissingFacesConfirm({ job, missing, total });
        return;
      }
      onMessage(error instanceof Error ? error.message : "Retry failed", { variant: "error" });
    }
  };

  const selectedReport = report?.images.find((item) => item.jobId === selected?.id);
  const detections =
    selectedReport?.detections ??
    (Array.isArray(selected?.resultSummary?.detections) ? (selected.resultSummary.detections as Detection[]) : []);
  const hasWhitelist = Boolean(batch.whitelistKeys && batch.whitelistKeys.length > 0);
  const completedJobs = useMemo(() => batch.jobs.filter((job) => job.status === "COMPLETED"), [batch.jobs]);

  const whitelistErrors = useMemo(() => {
    const messages = new Set<string>();
    for (const job of batch.jobs) {
      if (job.error?.code === "WHITELIST_REFERENCE_ERROR") {
        const formatted = formatJobErrorMessage(job.error);
        if (formatted) {
          messages.add(formatted);
        }
      }
    }
    return Array.from(messages);
  }, [batch.jobs]);

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
      onMessage("No completed results are available to download.", { variant: "error" });
      return;
    }
    try {
      const url = await getBatchZipUrl(batch.id);
      window.location.href = url;
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Failed to start zip download", { variant: "error" });
    }
  };

  const handleRunDraft = async () => {
    setStarting(true);
    try {
      await startBatch(batch.id);
      await onRefresh();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Failed to start batch", { variant: "error" });
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="details-card">
      <BatchHeader batch={batch} onDelete={() => setConfirm(true)} onBatchUpdated={() => void onRefresh()} />

      {whitelistErrors.length > 0 && (
        <Banner variant="error" role="alert">
          <div className="banner-action-row">
            <div>
              {whitelistErrors.map((msg) => (
                <div key={msg}>{msg}</div>
              ))}
              <div>Please choose a better reference and rerun the batch.</div>
            </div>
            <Link to={`/batches/${batch.id}/rerun`} className="secondary-button">
              Rerun batch
            </Link>
          </div>
        </Banner>
      )}

      <div className="details-layout" ref={detailsLayoutRef}>
        <div>
          <BatchImageList
            batch={batch}
            report={report?.images ?? []}
            selected={selected?.id ?? null}
            onSelect={(job) => setSelectedId(job.id)}
            onJobDeleted={() => void onRefresh()}
            onError={(message) => onMessage(message, { variant: "error" })}
          />
        </div>

        <div>
          {selected && selected.originalFilename.toLowerCase().endsWith(".mp4") ? (
            <VideoResultViewer job={selected} />
          ) : selected ? (
            <ImageResultViewer
              job={selected}
              detections={detections}
              reviewReasons={selectedReport?.reviewReasons ?? []}
              hasWhitelist={hasWhitelist}
              onRetry={(job) => void retry(job)}
              batchConfig={batch.config}
              onSelectJob={(id) => setSelectedId(id)}
              onRefresh={onRefresh}
              onError={(message) => onMessage(message, { variant: "error" })}
            />
          ) : null}
        </div>

        <div className="report-card details-report-card">
          <div className="section-kicker">BATCH REPORT</div>
          <BatchReport report={report} onSelectImage={handleSelectReportImage} />
          <div className="report-downloads">
            <button
              type="button"
              className="secondary-button"
              disabled={completedJobs.length === 0}
              onClick={() => void handleDownloadZip()}
            >
              Download zip ({completedJobs.length})
            </button>
            <button type="button" className="secondary-button" onClick={handleDownloadReport} disabled={!report}>
              Download JSON report
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={isDraft ? batch.jobs.length === 0 || starting : false}
              onClick={isDraft ? () => void handleRunDraft() : () => navigate(`/batches/${batch.id}/rerun`)}
            >
              {isDraft ? "Run" : "Rerun"}
            </button>
          </div>
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

      <DeleteBatchDialog
        open={Boolean(missingFacesConfirm)}
        title="Missing allow list faces"
        body={
          missingFacesConfirm
            ? `${missingFacesConfirm.missing} allow list face${
                missingFacesConfirm.missing === 1 ? " isn't" : "s aren't"
              } saved to a list and retrying will blur them.`
            : ""
        }
        confirmLabel="Retry anyway"
        onCancel={() => setMissingFacesConfirm(null)}
        onConfirm={() => {
          if (!missingFacesConfirm) return;
          const { job } = missingFacesConfirm;
          setMissingFacesConfirm(null);
          void retry(job, true);
        }}
      />
    </section>
  );
}
