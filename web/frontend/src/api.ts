import { Batch, BatchReport, Job } from "./types";

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

export type UploadProgress = {
  done: number;
  total: number;
  failed: File[];
};

export async function createDraftBatch(
  whitelist: File[],
  config: Record<string, unknown>,
  name?: string,
): Promise<{ batch: Batch }> {
  const form = new FormData();
  for (const file of whitelist) {
    form.append("whitelist", file);
  }
  form.append("config", JSON.stringify(config));
  if (name !== undefined && name !== null && name.trim() !== "") {
    form.append("name", name.trim());
  }
  return request("/api/batches", { method: "POST", body: form });
}

export async function uploadFileToBatch(batchId: string, file: File): Promise<{ job: Job }> {
  const form = new FormData();
  form.append("file", file);
  return request(`/api/batches/${batchId}/files`, { method: "POST", body: form });
}

export async function startBatch(batchId: string): Promise<{ batch: Batch }> {
  return request(`/api/batches/${batchId}/start`, { method: "POST" });
}

export async function uploadBatch(
  files: File[],
  whitelist: File[],
  config: Record<string, unknown>,
  onProgress?: (progress: UploadProgress) => void,
  existingBatchId?: string,
  name?: string,
): Promise<{ batch: Batch; failed: File[] }> {
  let batchId = existingBatchId;
  let batch: Batch;

  if (!batchId) {
    const created = await createDraftBatch(whitelist, config, name);
    batch = created.batch;
    batchId = batch.id;
  } else {
    const res = await getBatch(batchId);
    batch = res.batch;
  }

  const failed: File[] = [];
  let done = 0;
  const total = files.length;

  let currentIndex = 0;
  async function worker() {
    while (currentIndex < files.length) {
      const index = currentIndex++;
      const file = files[index];

      try {
        await uploadFileToBatch(batchId!, file);
      } catch (firstErr) {
        try {
          await uploadFileToBatch(batchId!, file);
        } catch (retryErr) {
          failed.push(file);
        }
      }

      done++;
      onProgress?.({ done, total, failed: [...failed] });
    }
  }

  const workerCount = Math.min(2, files.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  if (failed.length > 0) {
    return { batch, failed };
  }

  const started = await startBatch(batchId);
  return { batch: started.batch, failed: [] };
}

export function getBatch(id: string): Promise<{ batch: Batch }> {
  return request(`/api/batches/${id}`);
}

export function renameBatch(id: string, name: string): Promise<{ batch: Batch }> {
  return request<{ batch: Batch }>(`/api/batches/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function getBatchReport(id: string): Promise<{ report: BatchReport }> {
  return request<{ report: BatchReport }>(`/api/batches/${id}/report`);
}

export function retryJob(id: string): Promise<{ job: Job }> {
  return request(`/api/jobs/${id}/retry`, { method: "POST" });
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
