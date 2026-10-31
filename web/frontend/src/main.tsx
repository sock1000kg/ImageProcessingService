import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { deleteBatch, getBatch, getSystemStats, uploadBatch, startBatch } from "./api";
import { BatchCreateForm } from "./components/BatchCreateForm";
import { BatchDetails } from "./components/BatchDetails";
import { Dashboard } from "./components/Dashboard";
import { Batch } from "./types";
import "./styles.css";

function App() {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [view, setView] = useState<"dashboard" | "create">("dashboard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const refreshStats = async () => { try { setStats((await getSystemStats()).jobs ?? {}); } catch { /* Dashboard stats are non-blocking. */ } };
  const refreshBatch = async () => { if (!batch) return; try { setBatch((await getBatch(batch.id)).batch); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to refresh batch"); } };
  useEffect(() => { void refreshStats(); const timer = window.setInterval(() => void refreshStats(), 5000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!batch) return; const timer = window.setInterval(() => void refreshBatch(), 3000); return () => window.clearInterval(timer); }, [batch?.id]);
  const create = async (
    files: File[],
    whitelist: File[],
    config: Record<string, unknown>,
    onProgress?: (progress: { done: number; total: number; failed: File[] }) => void,
    existingBatchId?: string,
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await uploadBatch(files, whitelist, config, onProgress, existingBatchId);
      if (result.failed.length === 0) {
        setBatch(result.batch);
        setView("dashboard");
        setMessage("Batch created successfully");
        void refreshStats();
      }
      return result;
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "Upload failed";
      setError(text);
      throw reason;
    } finally {
      setBusy(false);
    }
  };
  const startWithoutThem = async (batchId: string) => {
    setBusy(true);
    setError("");
    try {
      const started = await startBatch(batchId);
      setBatch(started.batch);
      setView("dashboard");
      setMessage("Batch created successfully");
      void refreshStats();
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "Start failed";
      setError(text);
      throw reason;
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => { if (!batch) return; try { await deleteBatch(batch.id); setBatch(null); setMessage("Batch deleted"); void refreshStats(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Delete failed"); } };
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">✦</span><span>Privacy<span>Cloud</span></span></div><nav><button className={`nav-item ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>⌂ <span>Overview</span></button><button className={`nav-item ${view === "create" ? "active" : ""}`} onClick={() => setView("create")}>＋ <span>New batch</span></button>{batch && <button className="nav-item" onClick={() => setView("dashboard")}>▦ <span>Batch details</span></button>}</nav><div className="sidebar-footer"><span className="online-dot" /> Service operational</div></aside><main className="workspace"><header className="topbar"><div><p className="eyebrow">Cloud-native privacy service <span className="eyebrow-dot" /></p><h1>{view === "create" ? "Create a secure batch" : "Your privacy workspace"}</h1><p className="subtitle">{view === "create" ? "Configure redaction once. Workers handle the rest asynchronously." : "Monitor processing and review protected media in one place."}</p></div><div className="topbar-actions"><span className="last-sync">Live sync · 3s</span>{batch && <button className="secondary-button" onClick={() => void refreshBatch()}>Refresh</button>}<div className="avatar">PC</div></div></header>{message && <div className="success-banner" role="status">{message}</div>}{view === "create" ? <section className="page-section"><BatchCreateForm busy={busy} error={error} onSubmit={create} onStartWithoutFailed={startWithoutThem} /></section> : <><Dashboard stats={stats} batch={batch} onCreate={() => setView("create")} />{batch && <BatchDetails batch={batch} onRefresh={refreshBatch} onDelete={remove} onMessage={setMessage} />}</>}</main></div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
