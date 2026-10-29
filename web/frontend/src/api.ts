import { Batch, Job } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 204) {
    return {} as T;
  }
  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message ?? (typeof data.error === "string" ? data.error : "Request failed");
    throw new Error(message);
  }
  return data;
}

export function buildBatchFormData(
  files: File[],
  whitelist: File[],
  config: Record<string, unknown>,
): FormData {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  for (const file of whitelist) {
    form.append("whitelist", file);
  }
  form.append("config", JSON.stringify(config));
  return form;
}

export function submitBatch(
  files: File[],
  whitelist: File[],
  config: Record<string, unknown>,
): Promise<{ batch: Batch }> {
  const form = buildBatchFormData(files, whitelist, config);
  return request("/api/batches", { method: "POST", body: form });
}

export function getBatch(id: string): Promise<{ batch: Batch }> {
  return request(`/api/batches/${id}`);
}

export function getBatchReport(id: string): Promise<{ report: Record<string, unknown> }> {
  return request(`/api/batches/${id}/report`);
}

export function deleteBatch(id: string): Promise<void> {
  return request(`/api/batches/${id}`, { method: "DELETE" });
}

export function getJob(id: string): Promise<{ job: Job }> {
  return request(`/api/jobs/${id}`);
}

export function getSystemStats(): Promise<{ jobs: Record<string, number> }> {
  return request("/api/system/stats");
}
