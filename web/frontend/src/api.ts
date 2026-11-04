/**
 * HTTP client API layer communicating with the backend REST endpoints.
 */
import { Batch, BatchListResponse, BatchReport, Job } from "./types";
import { getAccessToken, refreshAccessToken } from "./auth";

/**
 * fetch() with the in-memory access token as a Bearer header. On a 401 it refreshes the token once (the refresh
 * cookie rides along automatically) and repeats the request, so callers never see an expired-token error.
 */
async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const send = () => {
    const token = getAccessToken();
    if (!token) return fetch(url, init);
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  const response = await send();
  if (response.status !== 401 || url.startsWith("/api/auth/")) return response;
  const refreshed = await refreshAccessToken();
  return refreshed ? send() : response;
}

async function errorMessage(response: Response): Promise<string> {
  const data = await response.json().catch(() => ({}));
  return data.error?.message ?? (typeof data.error === "string" ? data.error : "Request failed");
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authedFetch(url, init);
  if (response.status === 204) {
    return {} as T;
  }
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response.json();
}

/**
 * Downloads a job's original image. It is a protected API route, so an <img src> (which cannot send the Bearer
 * header) would get 401; callers turn this Blob into an object URL instead.
 */
export async function fetchJobOriginal(id: string, signal?: AbortSignal): Promise<Blob> {
  const response = await authedFetch(`/api/jobs/${id}/original`, { signal });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response.blob();
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
 * Lists user batches with pagination and whole-account usage statistics.
 */
export function listBatches(params?: { limit?: number; cursor?: string }): Promise<BatchListResponse> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  return request(`/api/batches${query ? `?${query}` : ""}`);
}

/**
 * Permanently deletes an individual image job and its associated storage objects.
 */
export function deleteJob(id: string): Promise<void> {
  return request(`/api/jobs/${id}`, { method: "DELETE" });
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
