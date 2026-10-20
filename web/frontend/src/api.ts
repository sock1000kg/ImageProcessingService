import { Job } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function listJobs(): Promise<{ jobs: Job[] }> {
  return request("/api/jobs");
}

export function submitJob(file: File, type: string, params: Record<string, unknown>): Promise<{ job: Job }> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  form.append("params", JSON.stringify(params));
  return request("/api/jobs", { method: "POST", body: form });
}

export function getSystemStats(): Promise<{ jobs: Record<string, number> }> {
  return request("/api/system/stats");
}
