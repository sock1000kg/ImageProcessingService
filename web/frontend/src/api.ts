/**
 * HTTP client API layer communicating with the backend REST endpoints.
 */
import { Batch, BatchListResponse, BatchReport, FaceListItem, Job } from "./types";
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

/**
 * Error raised on non-2xx responses from the backend API, preserving status, code, and details.
 */
export class ApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(message: string, options?: { code?: string; details?: unknown; status: number }) {
    super(message);
    this.name = "ApiError";
    this.code = options?.code;
    this.details = options?.details;
    this.status = options?.status ?? 500;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

async function parseApiError(response: Response): Promise<ApiError> {
  const data = await response.json().catch(() => ({}));
  const message = data.error?.message ?? (typeof data.error === "string" ? data.error : "Request failed");
  const code = typeof data.error?.code === "string" ? data.error.code : undefined;
  const details = data.error?.details;
  return new ApiError(message, { code, details, status: response.status });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authedFetch(url, init);
  if (response.status === 204) {
    return {} as T;
  }
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return response.json();
}

/**
 * Fetches a private image blob from an authenticated API endpoint.
 *
 * Why authedFetch: Protected image endpoints require the Bearer access token; standard <img> tags
 * cannot send custom headers and would receive 401. Callers convert the returned Blob into an object URL.
 */
export async function fetchPrivateImage(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await authedFetch(path, { signal });
  if (!response.ok) {
    throw await parseApiError(response);
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
  faceListId?: string,
  faceListIds?: string[],
): Promise<{ batch: Batch }> {
  const form = new FormData();
  for (const file of whitelist) {
    form.append("whitelist", file);
  }
  form.append("config", JSON.stringify(config));
  if (name !== undefined && name !== null && name.trim() !== "") {
    form.append("name", name.trim());
  }
  const resolvedIds =
    faceListIds && faceListIds.length > 0
      ? faceListIds
      : faceListId && faceListId.trim() !== ""
        ? [faceListId.trim()]
        : [];
  for (const id of resolvedIds) {
    form.append("faceListIds", id);
  }
  if (faceListId && (!faceListIds || faceListIds.length === 0)) {
    form.append("faceListId", faceListId.trim());
  }
  return request("/api/batches", { method: "POST", body: form });
}

/**
 * Re-runs an existing batch with new redaction settings from stored originals.
 *
 * Why multipart request: Accommodates both JSON configuration parameters and up to 20 optional
 * face reference files and allow lists in a single network round-trip.
 */
export async function rerunBatch(
  id: string,
  whitelist: File[],
  config: Record<string, unknown>,
  name?: string,
  faceListId?: string,
  faceListIds?: string[],
): Promise<{ batch: Batch; skipped: number }> {
  const form = new FormData();
  for (const file of whitelist) {
    form.append("whitelist", file);
  }
  form.append("config", JSON.stringify(config));
  if (name !== undefined && name !== null && name.trim() !== "") {
    form.append("name", name.trim());
  }
  const resolvedIds =
    faceListIds && faceListIds.length > 0
      ? faceListIds
      : faceListId && faceListId.trim() !== ""
        ? [faceListId.trim()]
        : [];
  for (const listId of resolvedIds) {
    form.append("faceListIds", listId);
  }
  if (faceListId && (!faceListIds || faceListIds.length === 0)) {
    form.append("faceListId", faceListId.trim());
  }
  return request<{ batch: Batch; skipped: number }>(`/api/batches/${id}/rerun`, { method: "POST", body: form });
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
  faceListId?: string,
  faceListIds?: string[],
): Promise<{ batch: Batch; failed: File[] }> {
  let batchId = existingBatchId;
  let batch: Batch;

  if (!batchId) {
    const created = await createDraftBatch(whitelist, config, name, faceListId, faceListIds);
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
 * Requests a short-lived download token URL for streaming a batch's completed results as a zip.
 */
export async function getBatchZipUrl(id: string): Promise<string> {
  const data = await request<{ url: string }>(`/api/batches/${id}/download-token`, {
    method: "POST",
  });
  return data.url;
}

/**
 * Enqueues a retry for a failed job, optionally accepting that missing whitelist faces will be blurred.
 */
export function retryJob(id: string, options?: { acceptMissingFaces?: boolean }): Promise<{ job: Job }> {
  return request(`/api/jobs/${id}/retry`, {
    method: "POST",
    headers: options?.acceptMissingFaces ? { "Content-Type": "application/json" } : undefined,
    body: options?.acceptMissingFaces ? JSON.stringify({ acceptMissingFaces: true }) : undefined,
  });
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

/**
 * Lists all saved face reference lists owned by the authenticated user.
 */
export function listFaceLists(): Promise<{ lists: FaceListItem[] }> {
  return request("/api/face-lists");
}

/**
 * Creates a new saved face list with a name and 1-5 reference face photos.
 *
 * Why opt-in: Reference faces are explicitly saved by the user and kept until deletion,
 * unlike batch whitelists which are deleted automatically when jobs finish.
 */
export async function createFaceList(name: string, faces: File[]): Promise<{ list: FaceListItem }> {
  const form = new FormData();
  form.append("name", name);
  for (const file of faces) {
    form.append("faces", file);
  }
  return request("/api/face-lists", { method: "POST", body: form });
}

/**
 * Appends additional biometric reference faces to an existing allow list.
 *
 * Why atomic upload: Uploads directly to the list's endpoint to guarantee the cap is enforced
 * atomically on the backend without overwriting existing reference faces.
 */
export async function addFacesToList(id: string, files: File[]): Promise<{ list: FaceListItem }> {
  const form = new FormData();
  for (const file of files) {
    form.append("faces", file);
  }
  return request(`/api/face-lists/${id}/faces`, { method: "POST", body: form });
}

/**
 * Deletes a single biometric face from a saved allow list.
 *
 * Why returns { list | null }: If the list's only face was deleted, the list is removed and
 * list is returned as null. Otherwise returns the updated list item with decremented faceCount.
 */
export function deleteFaceFromList(id: string, n: number): Promise<{ list: FaceListItem | null }> {
  return request(`/api/face-lists/${id}/faces/${n}`, { method: "DELETE" });
}

/**
 * Permanently deletes a saved face list and purges its biometric references from storage.
 */
export function deleteFaceList(id: string): Promise<void> {
  return request(`/api/face-lists/${id}`, { method: "DELETE" });
}

/**
 * Renames a saved face list.
 *
 * Why owner-scoped PATCH: Allows changing the display title of an enrolled biometric list
 * without re-uploading or modifying the underlying facial reference images.
 */
export function renameFaceList(id: string, name: string): Promise<{ list: FaceListItem }> {
  return request<{ list: FaceListItem }>(`/api/face-lists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}
