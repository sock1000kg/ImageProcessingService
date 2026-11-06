/**
 * Media library page route listing user batches with thumbnails, storage analytics, inline renaming, and deletion.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteBatch, getBatchZipUrl, listBatches, renameBatch } from "../api";
import { DeleteBatchDialog } from "../components/DeleteBatchDialog";
import { InlineRename } from "../components/InlineRename";
import { Banner } from "../components/ui/Banner";
import { StatTile } from "../components/ui/StatTile";
import { StatusBadge } from "../components/ui/StatusBadge";
import { TrashIcon } from "../components/ui/TrashIcon";
import { AccountUsage, BatchSummaryItem, MessageHandler } from "../types";
import { formatBytes } from "../utils/format";

export interface LibraryPageProps {
  onMessage?: MessageHandler;
}

export function LibraryPage({ onMessage }: LibraryPageProps) {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchSummaryItem[]>([]);
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<BatchSummaryItem | null>(null);

  const fetchInitialBatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBatches({ limit: 20 });
      setBatches(data.batches);
      setUsage(data.usage);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchInitialBatches();
  }, []);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await listBatches({ limit: 20, cursor: nextCursor });
      setBatches((prev) => [...prev, ...data.batches]);
      setUsage(data.usage);
      setNextCursor(data.nextCursor);
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to load more batches", { variant: "error" });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRename = async (id: string, newName: string) => {
    await renameBatch(id, newName);
    setBatches((prev) => prev.map((item) => (item.id === id ? { ...item, name: newName } : item)));
    onMessage?.("Batch renamed");
  };

  const handleDeleteConfirm = async () => {
    if (!deletingBatch) return;
    const target = deletingBatch;
    setDeletingBatch(null);
    try {
      await deleteBatch(target.id);
      setBatches((prev) => prev.filter((item) => item.id !== target.id));
      setUsage((prev) =>
        prev
          ? {
              batches: Math.max(0, prev.batches - 1),
              jobs: Math.max(0, prev.jobs - target.jobCounts.total),
              bytes: Math.max(0, prev.bytes - target.bytes),
            }
          : null,
      );
      onMessage?.("Batch deleted");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to delete batch", { variant: "error" });
    }
  };

  const handleDownloadZip = async (batchId: string) => {
    try {
      const url = await getBatchZipUrl(batchId);
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to download zip";
      onMessage?.(message, { variant: "error" });
    }
  };

  return (
    <section className="library-page">
      <div className="welcome-card">
        <div>
          <span className="section-kicker">MEDIA LIBRARY</span>
          <h2>Media library</h2>
          <p>Manage stored originals, completed results, and account storage.</p>
        </div>
        <Link to="/batches/new" className="primary-button">
          Create new batch <span>→</span>
        </Link>
      </div>

      {error && <Banner variant="error">{error}</Banner>}

      {usage && (
        <div className="stats-grid compact-stats">
          <StatTile label="Storage used" value={formatBytes(usage.bytes)} />
          <StatTile label="Batches" value={usage.batches} />
          <StatTile label="Total images" value={usage.jobs} />
        </div>
      )}

      {loading && batches.length === 0 && <div className="viewer-empty">Loading media library…</div>}

      {!loading && batches.length === 0 && (
        <div className="empty-dashboard">
          <span>✦</span>
          <h3>No batches in library</h3>
          <p>Create a batch to start protecting your media.</p>
        </div>
      )}

      {batches.length > 0 && (
        <>
          <div className="library-grid">
            {batches.map((batch) => (
              <article key={batch.id} className="library-card" aria-label={batch.name}>
                <div className="library-card-header">
                  {batch.thumbnailUrl ? (
                    <img src={batch.thumbnailUrl} alt={batch.name} className="library-thumbnail" />
                  ) : (
                    <div className="library-thumbnail placeholder" aria-label="No thumbnail">
                      <span>🖼</span>
                    </div>
                  )}
                  <div className="library-card-body">
                    <InlineRename
                      name={batch.name}
                      headingLevel="h3"
                      onSave={(newName) => handleRename(batch.id, newName)}
                    />
                    <div className="library-card-status">
                      <StatusBadge status={batch.status} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="delete-item-button"
                    title="Delete batch"
                    aria-label={`Delete ${batch.name}`}
                    onClick={() => setDeletingBatch(batch)}
                  >
                    <TrashIcon />
                  </button>
                </div>
                <div className="library-card-meta">
                  <span>
                    <strong>
                      {batch.jobCounts.completed}/{batch.jobCounts.total}
                    </strong>{" "}
                    complete{batch.jobCounts.failed > 0 ? ` · ${batch.jobCounts.failed} failed` : ""}
                  </span>
                  <span>{formatBytes(batch.bytes)}</span>
                  <span>{new Date(batch.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="library-card-actions">
                  <Link to={`/batches/${batch.id}`} className="primary-button">
                    Open
                  </Link>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={batch.status === "DRAFT"}
                    onClick={() => navigate(`/batches/${batch.id}/rerun`)}
                  >
                    Rerun
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={batch.jobCounts.completed === 0}
                    onClick={() => void handleDownloadZip(batch.id)}
                  >
                    Download
                  </button>
                </div>
              </article>
            ))}
          </div>

          {nextCursor && (
            <div className="load-more-row">
              <button
                type="button"
                className="secondary-button"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      <DeleteBatchDialog
        open={Boolean(deletingBatch)}
        title="Delete this batch?"
        body="Original files and results will be removed. This cannot be undone."
        confirmLabel="Delete batch"
        onCancel={() => setDeletingBatch(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </section>
  );
}
