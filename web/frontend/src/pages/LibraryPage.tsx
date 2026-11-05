/**
 * Media library page route listing user batches with thumbnails, storage analytics, inline renaming, and deletion.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteBatch, deleteFaceList, getBatchZipUrl, listBatches, listFaceLists, renameBatch } from "../api";
import { DeleteBatchDialog } from "../components/DeleteBatchDialog";
import { InlineRename } from "../components/InlineRename";
import { Banner } from "../components/ui/Banner";
import { StatTile } from "../components/ui/StatTile";
import { StatusBadge } from "../components/ui/StatusBadge";
import { AccountUsage, BatchSummaryItem, FaceListItem } from "../types";
import { formatBytes } from "../utils/format";
import { useFaceListThumbnail } from "../hooks/useFaceListThumbnail";

function SavedFaceThumbnail({ listId, index }: { listId: string; index: number }) {
  const url = useFaceListThumbnail(listId, index);
  return <img src={url ?? undefined} alt={`Face ${index}`} />;
}

export interface LibraryPageProps {
  onMessage?: (message: string) => void;
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
  const [faceLists, setFaceLists] = useState<FaceListItem[]>([]);
  const [deletingFaceList, setDeletingFaceList] = useState<FaceListItem | null>(null);

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

  const fetchInitialFaceLists = async () => {
    try {
      const data = await listFaceLists();
      if (data && Array.isArray(data.lists)) {
        setFaceLists(data.lists);
      }
    } catch {
      // Quiet fallback
    }
  };

  useEffect(() => {
    void fetchInitialBatches();
    void fetchInitialFaceLists();
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
      setError(err instanceof Error ? err.message : "Failed to load more batches");
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
      setError(err instanceof Error ? err.message : "Failed to delete batch");
    }
  };

  const handleDownloadZip = async (batchId: string) => {
    try {
      const url = await getBatchZipUrl(batchId);
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to download zip";
      setError(message);
      onMessage?.(message);
    }
  };

  const handleDeleteFaceListConfirm = async () => {
    if (!deletingFaceList) return;
    const target = deletingFaceList;
    setDeletingFaceList(null);
    try {
      await deleteFaceList(target.id);
      setFaceLists((prev) => prev.filter((item) => item.id !== target.id));
      onMessage?.("Face list deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete face list");
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
              <div key={batch.id} className="library-card">
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
                  <Link to={`/batches/${batch.id}`} className="secondary-button">
                    Open batch
                  </Link>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={batch.status === "DRAFT"}
                    onClick={() => navigate(`/batches/${batch.id}/rerun`)}
                  >
                    Re-run with new settings
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={batch.jobCounts.completed === 0}
                    onClick={() => void handleDownloadZip(batch.id)}
                  >
                    Download zip
                  </button>
                  <button type="button" className="danger-button" onClick={() => setDeletingBatch(batch)}>
                    Delete
                  </button>
                </div>
              </div>
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

      <div className="saved-face-lists-section" style={{ marginTop: "2.5rem" }}>
        <div className="section-header" style={{ marginBottom: "1rem" }}>
          <span className="section-kicker">SAVED LISTS</span>
          <h2>Saved face lists</h2>
          <p>Reusable face whitelist profiles kept under your account until deleted.</p>
        </div>

        {(faceLists ?? []).length === 0 ? (
          <div className="empty-dashboard" style={{ marginTop: "1rem", padding: "1.5rem" }}>
            <span>👤</span>
            <h3>No saved face lists</h3>
            <p>Save reference faces when creating a batch to reuse them across multiple batches.</p>
          </div>
        ) : (
          <div className="library-grid">
            {(faceLists ?? []).map((list) => (
              <div key={list.id} className="library-card">
                <div className="library-card-header">
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", maxWidth: "120px" }}>
                    {Array.from({ length: Math.min(5, list.faceCount) }, (_, i) => i + 1).map((n) => (
                      <div key={n} className="thumbnail-container" style={{ width: "36px", height: "36px" }}>
                        <SavedFaceThumbnail listId={list.id} index={n} />
                        <span className="thumbnail-badge">{`#${n}`}</span>
                      </div>
                    ))}
                  </div>
                  <div className="library-card-body">
                    <h3>{list.name}</h3>
                    <div className="library-card-meta" style={{ marginTop: "0.25rem" }}>
                      <span>
                        {list.faceCount} {list.faceCount === 1 ? "face" : "faces"}
                      </span>
                      <span>{new Date(list.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="library-card-actions">
                  <button type="button" className="danger-button" onClick={() => setDeletingFaceList(list)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DeleteBatchDialog
        open={Boolean(deletingBatch)}
        title="Delete this batch?"
        body="Original files and results will be removed. This cannot be undone."
        confirmLabel="Delete batch"
        onCancel={() => setDeletingBatch(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />

      <DeleteBatchDialog
        open={Boolean(deletingFaceList)}
        title="Delete this face list?"
        body="All saved reference faces in this list will be removed from storage immediately. This cannot be undone."
        confirmLabel="Delete face list"
        onCancel={() => setDeletingFaceList(null)}
        onConfirm={() => void handleDeleteFaceListConfirm()}
      />
    </section>
  );
}
