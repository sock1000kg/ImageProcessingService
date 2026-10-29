import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { deleteBatch, getBatch, getSystemStats, submitBatch } from "./api";
import { JobList } from "./components/JobList";
import { UploadForm } from "./components/UploadForm";
import { Batch, Job } from "./types";
import "./styles.css";

type StatusFilter = "ALL" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

function App() {
  const [currentBatch, setCurrentBatch] = useState<Batch | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const refreshStats = async () => {
    try {
      const statsData = await getSystemStats();
      setStats(statsData.jobs ?? {});
    } catch {
      // Ignore stats error
    }
  };

  const refreshBatch = async (batchId: string) => {
    try {
      const { batch } = await getBatch(batchId);
      setCurrentBatch(batch);
      setJobs(batch.jobs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cannot refresh batch");
    }
  };

  useEffect(() => {
    void refreshStats();
    const statsTimer = window.setInterval(() => void refreshStats(), 3000);
    return () => window.clearInterval(statsTimer);
  }, []);

  useEffect(() => {
    if (!currentBatch?.id) return;
    const batchTimer = window.setInterval(() => void refreshBatch(currentBatch.id), 3000);
    return () => window.clearInterval(batchTimer);
  }, [currentBatch?.id]);

  const visibleJobs = jobs.filter((job) => {
    const matchesQuery = `${job.originalFilename} ${job.id}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (statusFilter === "ALL" || job.status === statusFilter);
  });

  const handleSubmit = async (
    files: File[],
    whitelist: File[],
    config: Record<string, unknown>,
  ) => {
    setBusy(true);
    setMessage("");
    try {
      const { batch } = await submitBatch(files, whitelist, config);
      setCurrentBatch(batch);
      setJobs(batch.jobs);
      setMessage(`Batch submitted (${batch.jobs.length} jobs)`);
      void refreshStats();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cannot submit batch");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!currentBatch) return;
    if (!window.confirm("Are you sure you want to delete this batch and its results?")) return;
    try {
      await deleteBatch(currentBatch.id);
      setCurrentBatch(null);
      setJobs([]);
      setMessage("Batch deleted");
      void refreshStats();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete batch");
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <span>
            Image<span>Redact</span>
          </span>
        </div>
        <nav>
          <a className="nav-item active" href="#upload">
            <span>＋</span> New batch
          </a>
          <a className="nav-item" href="#jobs">
            <span>▦</span> Batch jobs
          </a>
          <a className="nav-item" href="#system">
            <span>◉</span> System status
          </a>
        </nav>
        <div className="sidebar-footer">
          <span className="online-dot" /> Redaction service online
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              Privacy workspace <span className="eyebrow-dot" />
            </p>
            <h1>Redact photos & plates</h1>
            <p className="subtitle">
              Upload an image batch with optional face whitelist and let workers anonymize them.
            </p>
          </div>
          <div className="topbar-actions">
            <span className="last-sync">Live sync · 3s</span>
            {currentBatch && (
              <button
                className="secondary refresh-button"
                onClick={() => void refreshBatch(currentBatch.id)}
              >
                ↻ <span>Refresh</span>
              </button>
            )}
            <div className="avatar">AC</div>
          </div>
        </header>

        <section className="stats-grid" id="system">
          <div className="stat-card">
            <span className="stat-icon purple">✦</span>
            <div>
              <span className="stat-label">Total jobs</span>
              <strong>{Object.values(stats).reduce((sum, value) => sum + value, 0)}</strong>
            </div>
            <span className="stat-trend">All time</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon blue">◌</span>
            <div>
              <span className="stat-label">Processing</span>
              <strong>{(stats.PROCESSING ?? 0) + (stats.QUEUED ?? 0)}</strong>
            </div>
            <span className="stat-trend blue-text">In queue</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon green">✓</span>
            <div>
              <span className="stat-label">Completed</span>
              <strong>{stats.COMPLETED ?? 0}</strong>
            </div>
            <span className="stat-trend green-text">Successful</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon orange">!</span>
            <div>
              <span className="stat-label">Failed</span>
              <strong>{stats.FAILED ?? 0}</strong>
            </div>
            <span className="stat-trend orange-text">Needs review</span>
          </div>
        </section>

        <section className="hero-card" id="upload">
          <div className="section-kicker">CREATE A NEW BATCH</div>
          <h2>Upload and redact</h2>
          <p className="section-description">
            Cloud-native privacy service conforming to integration contract §2A.
          </p>
          <UploadForm busy={busy} onSubmit={handleSubmit} />
          {message && <p className="message">{message}</p>}
        </section>

        <section className="card jobs-card" id="jobs">
          <div className="section-heading">
            <div>
              <div className="section-kicker">BATCH ACTIVITY</div>
              <h2>
                {currentBatch ? `Batch: ${currentBatch.id}` : "Current batch"}
              </h2>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              {currentBatch && (
                <>
                  <span className={`status ${currentBatch.status.toLowerCase()}`}>
                    {currentBatch.status}
                  </span>
                  <button
                    className="secondary"
                    style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem", color: "#e11d48" }}
                    onClick={() => void handleDeleteBatch()}
                  >
                    Delete batch
                  </button>
                </>
              )}
              <span className="job-count">
                {visibleJobs.length} of {jobs.length}
              </span>
            </div>
          </div>

          <div className="job-toolbar">
            <label className="search-box">
              <span>⌕</span>
              <input
                aria-label="Search jobs"
                placeholder="Search by file name or job ID..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="filter-tabs" role="tablist" aria-label="Filter jobs">
              {(["ALL", "PROCESSING", "COMPLETED", "FAILED"] as StatusFilter[]).map((filter) => (
                <button
                  className={statusFilter === filter ? "filter-tab active" : "filter-tab"}
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                >
                  {filter === "ALL" ? "All jobs" : filter.charAt(0) + filter.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <JobList jobs={visibleJobs} filtered={Boolean(query || statusFilter !== "ALL")} />
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
