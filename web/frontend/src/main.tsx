import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Job = {
  id: string;
  type: string;
  originalFilename: string;
  status: string;
  progress: number;
  stage: string | null;
  resultUrl: string | null;
  resultSummary: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
};

const statusLabel: Record<string, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("object-detection");
  const [targetFormat, setTargetFormat] = useState("WEBP");
  const [quality, setQuality] = useState("85");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    try {
      const data = await request<{ jobs: Job[] }>("/api/jobs");
      setJobs(data.jobs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cannot load jobs");
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return setMessage("Choose an image first");
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    const params = type === "object-detection"
      ? { confidenceThreshold: 0.45 }
      : {
          targetFormat,
          quality: Number(quality),
          ...(width ? { width: Number(width) } : {}),
          ...(height ? { height: Number(height) } : {}),
        };
    form.append("params", JSON.stringify(params));
    try {
      await request("/api/jobs", { method: "POST", body: form });
      setFile(null);
      (event.currentTarget as HTMLFormElement).reset();
      setMessage("Job submitted");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cannot submit job");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Cloud-native demo</p>
          <h1>Image Processing Service</h1>
          <p className="subtitle">Upload media, choose a worker task, and follow the result.</p>
        </div>
        <button className="secondary" onClick={() => void refresh()}>Refresh</button>
      </header>
      <section className="card">
        <h2>New processing job</h2>
        <form onSubmit={submit}>
          <label>Image file<input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <label>Task<select value={type} onChange={(event) => setType(event.target.value)}><option value="object-detection">Object detection (AI)</option><option value="image-convert">Image convert</option></select></label>
          {type === "image-convert" && <div className="options">
            <label>Target format<select value={targetFormat} onChange={(event) => setTargetFormat(event.target.value)}><option>WEBP</option><option>JPEG</option><option>PNG</option></select></label>
            <label>Quality (1-100)<input type="number" min="1" max="100" value={quality} onChange={(event) => setQuality(event.target.value)} /></label>
            <label>Width (optional)<input type="number" min="1" value={width} onChange={(event) => setWidth(event.target.value)} /></label>
            <label>Height (optional)<input type="number" min="1" value={height} onChange={(event) => setHeight(event.target.value)} /></label>
          </div>}
          <button disabled={busy}>{busy ? "Submitting..." : "Start processing"}</button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>
      <section className="card">
        <div className="section-heading"><h2>Jobs</h2><span>{jobs.length} recent</span></div>
        {jobs.length === 0 ? <p className="empty">No jobs yet.</p> : <div className="jobs">{jobs.map((job) => <article className="job" key={job.id}>
          <div className="job-top"><strong>{job.originalFilename}</strong><span className={`status ${job.status.toLowerCase()}`}>{statusLabel[job.status] ?? job.status}</span></div>
          <p className="job-id">{job.id} · {job.type}</p>
          <div className="progress"><span style={{ width: `${job.progress}%` }} /></div>
          <div className="job-bottom"><span>{job.stage ?? "Waiting"} · {job.progress}%</span>{job.resultUrl && <a href={job.resultUrl} target="_blank" rel="noreferrer">View / download result</a>}</div>
          {job.error && <p className="error">{job.error.code}: {job.error.message}</p>}
          {job.resultSummary && <details><summary>Result summary</summary><pre>{JSON.stringify(job.resultSummary, null, 2)}</pre></details>}
        </article>)}</div>}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
