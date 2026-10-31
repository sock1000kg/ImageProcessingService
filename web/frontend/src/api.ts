/**
 * HTTP client API layer communicating with the backend REST endpoints.
 */
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

/**
 * Progress event payload emitted during chunked batch uploads.
 */
export type UploadProgress = {
  done: number;
  total: number;
  failed: File[];
};

/**
 * Creates a new draft batch with optional whitelist faces and configuration profile.
 */
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

/**
 * Uploads a single image file into an existing draft batch.
 */
export async function uploadFileToBatch(batchId: string, file: File): Promise<{ job: Job }> {
  const form = new FormData();
  form.append("file", file);
  return request(`/api/batches/${batchId}/files`, { method: "POST", body: form });
}

/**
 * Starts processing an existing draft batch by queueing pending jobs to NATS JetStream.
 */
export async function startBatch(batchId: string): Promise<{ batch: Batch }> {
  return request(`/api/batches/${batchId}/start`, { method: "POST" });
}

/**
 * Coordinates draft creation, parallel file upload workers (concurrency 2), and execution kickoff.
 */
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
      } catch {
        try {
          await uploadFileToBatch(batchId!, file);
        } catch {
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

/**
 * Fetches batch details and current jobs status by batch ID.
 */
export function getBatch(id: string): Promise<{ batch: Batch }> {
  return request(`/api/batches/${id}`);
}

/**
 * Renames an existing batch.
 */
export function renameBatch(id: string, name: string): Promise<{ batch: Batch }> {
  return request<{ batch: Batch }>(`/api/batches/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

/**
 * Fetches the computed audit report for a batch.
 */
export function getBatchReport(id: string): Promise<{ report: BatchReport }> {
  return request<{ report: BatchReport }>(`/api/batches/${id}/report`);
}

/**
 * Enqueues a retry for a failed job.
 */
export function retryJob(id: string): Promise<{ job: Job }> {
  return request(`/api/jobs/${id}/retry`, { method: "POST" });
}

/**
 * Permanently deletes a batch, its database records, and associated S3 artifacts.
 */
export function deleteBatch(id: string): Promise<void> {
  return request(`/api/batches/${id}`, { method: "DELETE" });
}

/**
 * Fetches single job status.
 */
export function getJob(id: string): Promise<{ job: Job }> {
  return request(`/api/jobs/${id}`);
}

/**
 * Retrieves aggregate system job processing counts across all batches.
 */
export function getSystemStats(): Promise<{ jobs: Record<string, number> }> {
  return request("/api/system/stats");
}
