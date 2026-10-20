import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { getSystemStats, listJobs, submitJob } from "./api";
import { JobList } from "./components/JobList";
import { UploadForm } from "./components/UploadForm";
import "./styles.css";

type StatusFilter = "ALL" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

function App() {
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof listJobs>>["jobs"]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const refresh = async () => {
    try {
      const [jobData, statsData] = await Promise.all([listJobs(), getSystemStats()]);
      setJobs(jobData.jobs);
      setStats(statsData.jobs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cannot load jobs");
    }
  };

  const visibleJobs = jobs.filter((job) => {
    const matchesQuery = `${job.originalFilename} ${job.id} ${job.type}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (statusFilter === "ALL" || job.status === statusFilter);
  });

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSubmit = async (file: File, type: string, params: Record<string, unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await submitJob(file, type, params);
      setMessage("Job submitted");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cannot submit job");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><span>Image<span>Cloud</span></span></div>
      <nav>
        <a className="nav-item active" href="#upload"><span>＋</span> New transformation</a>
        <a className="nav-item" href="#jobs"><span>▦</span> Assets & jobs</a>
        <a className="nav-item" href="#system"><span>◉</span> System status</a>
      </nav>
      <div className="sidebar-footer"><span className="online-dot" /> Processing service online</div>
    </aside>
    <main className="workspace">
      <header className="topbar">
        <div><p className="eyebrow">Media workspace <span className="eyebrow-dot" /></p><h1>Transform your media</h1><p className="subtitle">Upload an image, choose a transformation, and let your workers do the rest.</p></div>
        <div className="topbar-actions"><span className="last-sync">Live sync · 3s</span><button className="secondary refresh-button" onClick={() => void refresh()}>↻ <span>Refresh</span></button><div className="avatar">AC</div></div>
      </header>
      <section className="stats-grid" id="system">
        <div className="stat-card"><span className="stat-icon purple">✦</span><div><span className="stat-label">Total jobs</span><strong>{Object.values(stats).reduce((sum, value) => sum + value, 0)}</strong></div><span className="stat-trend">All time</span></div>
        <div className="stat-card"><span className="stat-icon blue">◌</span><div><span className="stat-label">Processing</span><strong>{(stats.PROCESSING ?? 0) + (stats.QUEUED ?? 0)}</strong></div><span className="stat-trend blue-text">In queue</span></div>
        <div className="stat-card"><span className="stat-icon green">✓</span><div><span className="stat-label">Completed</span><strong>{stats.COMPLETED ?? 0}</strong></div><span className="stat-trend green-text">Successful</span></div>
        <div className="stat-card"><span className="stat-icon orange">!</span><div><span className="stat-label">Failed</span><strong>{stats.FAILED ?? 0}</strong></div><span className="stat-trend orange-text">Needs review</span></div>
      </section>
      <section className="hero-card" id="upload">
        <div className="section-kicker">CREATE A NEW JOB</div>
        <h2>Upload and transform</h2>
        <p className="section-description">Powerful image processing, delivered asynchronously.</p>
        <UploadForm busy={busy} onSubmit={handleSubmit} />
        {message && <p className="message">{message}</p>}
      </section>
      <section className="card jobs-card" id="jobs">
        <div className="section-heading"><div><div className="section-kicker">ACTIVITY</div><h2>Recent jobs</h2></div><span className="job-count">{visibleJobs.length} of {jobs.length}</span></div>
        <div className="job-toolbar">
          <label className="search-box"><span>⌕</span><input aria-label="Search jobs" placeholder="Search by file name or job ID..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="filter-tabs" role="tablist" aria-label="Filter jobs">
            {(["ALL", "PROCESSING", "COMPLETED", "FAILED"] as StatusFilter[]).map((filter) => <button className={statusFilter === filter ? "filter-tab active" : "filter-tab"} key={filter} onClick={() => setStatusFilter(filter)}>{filter === "ALL" ? "All jobs" : filter.charAt(0) + filter.slice(1).toLowerCase()}</button>)}
          </div>
        </div>
        <JobList jobs={visibleJobs} filtered={Boolean(query || statusFilter !== "ALL")} />
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
