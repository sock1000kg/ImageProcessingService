// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RerunBatchPage } from "../src/pages/RerunBatchPage";
import { BatchDetails } from "../src/components/BatchDetails";
import { LibraryPage } from "../src/pages/LibraryPage";
import { Batch } from "../src/types";

describe("Batch Rerun Frontend DOM Tests (Task 38)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/batches/source-1/rerun")) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              batch: {
                id: "batch-new-rerun",
                name: "Holiday Trip (re-run)",
                status: "PROCESSING",
                config: {},
                whitelistKeys: [],
                whitelistDeletedAt: null,
                startedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                jobs: [],
              },
              skipped: 0,
            }),
          } as Response;
        }

        if (url.includes("/api/batches/source-1/report")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              report: {
                batchId: "source-1",
                totals: {
                  images: 3,
                  completed: 3,
                  failed: 0,
                  faces: 2,
                  plates: 1,
                  redacted: 3,
                  whitelisted: 0,
                  lowConfidence: 0,
                },
                images: [],
                reviewImages: [],
                reviewDetections: [],
                lowConfidenceDetections: [],
              },
            }),
          } as Response;
        }

        if (url.includes("/api/batches/source-1")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: {
                id: "source-1",
                name: "Holiday Trip",
                status: "COMPLETED",
                startedAt: "2026-11-04T10:00:00.000Z",
                createdAt: "2026-11-04T09:00:00.000Z",
                config: {
                  targets: ["face"],
                  style: "pixelate",
                  strength: 18,
                  padding: 0.15,
                  quality: "high",
                  format: "png",
                },
                whitelistKeys: [],
                whitelistDeletedAt: null,
                jobs: [
                  {
                    id: "job-1",
                    originalFilename: "photo1.jpg",
                    status: "COMPLETED",
                    progress: 100,
                    stage: "DONE",
                    resultUrl: "/results/source-1/job-1/result.png",
                    resultSummary: null,
                    error: null,
                    createdAt: "2026-11-04T09:01:00Z",
                    updatedAt: "2026-11-04T09:02:00Z",
                  },
                  {
                    id: "job-2",
                    originalFilename: "photo2.jpg",
                    status: "COMPLETED",
                    progress: 100,
                    stage: "DONE",
                    resultUrl: "/results/source-1/job-2/result.png",
                    resultSummary: null,
                    error: null,
                    createdAt: "2026-11-04T09:01:00Z",
                    updatedAt: "2026-11-04T09:02:00Z",
                  },
                  {
                    id: "job-3",
                    originalFilename: "photo3.jpg",
                    status: "COMPLETED",
                    progress: 100,
                    stage: "DONE",
                    resultUrl: "/results/source-1/job-3/result.png",
                    resultSummary: null,
                    error: null,
                    createdAt: "2026-11-04T09:01:00Z",
                    updatedAt: "2026-11-04T09:02:00Z",
                  },
                ],
              },
            }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("page prefills config and name from the source batch and hides the dropzone", async () => {
    render(
      <MemoryRouter initialEntries={["/batches/source-1/rerun"]}>
        <Routes>
          <Route path="/batches/:id/rerun" element={<RerunBatchPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Should load and show image count from source batch
    await waitFor(() => {
      expect(screen.getByText("3 images from Holiday Trip")).toBeDefined();
    });

    // Name should be prefilled with "<source name> (re-run)"
    const nameInput = screen.getByLabelText(/Batch name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Holiday Trip (re-run)");

    // Style select should be prefilled with "pixelate"
    const styleSelect = screen.getByLabelText(/Redaction style/i) as HTMLSelectElement;
    expect(styleSelect.value).toBe("pixelate");

    // Dropzone / folder picker must NOT be present
    expect(screen.queryByLabelText(/Choose images to redact/i)).toBeNull();
    expect(screen.queryByText(/Drop images here or browse/i)).toBeNull();
  });

  it("submit calls rerunBatch and navigates to the new batch page", async () => {
    const onMessage = vi.fn();
    render(
      <MemoryRouter initialEntries={["/batches/source-1/rerun"]}>
        <Routes>
          <Route path="/batches/:id/rerun" element={<RerunBatchPage onMessage={onMessage} />} />
          <Route path="/batches/:id" element={<div>Target Batch Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("3 images from Holiday Trip")).toBeDefined();
    });

    const submitBtn = screen.getByRole("button", { name: /Re-run batch/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    const form = submitBtn.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Target Batch Page")).toBeDefined();
    });

    expect(onMessage).toHaveBeenCalledWith("Batch created successfully");
  });

  it("shows skipped count in banner when rerunBatch reports skipped images", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/batches/source-1/rerun")) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              batch: {
                id: "batch-partial-rerun",
                name: "Holiday Trip (re-run)",
                status: "PROCESSING",
                config: {},
                whitelistKeys: [],
                whitelistDeletedAt: null,
                startedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                jobs: [],
              },
              skipped: 2,
            }),
          } as Response;
        }

        if (url.includes("/api/batches/source-1")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: {
                id: "source-1",
                name: "Holiday Trip",
                status: "COMPLETED",
                startedAt: "2026-11-04T10:00:00.000Z",
                createdAt: "2026-11-04T09:00:00.000Z",
                config: { targets: ["face"], style: "blur" },
                whitelistKeys: [],
                whitelistDeletedAt: null,
                jobs: [{ id: "j1", originalFilename: "p1.jpg", status: "COMPLETED" }],
              },
            }),
          } as Response;
        }

        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }),
    );

    const onMessage = vi.fn();
    render(
      <MemoryRouter initialEntries={["/batches/source-1/rerun"]}>
        <Routes>
          <Route path="/batches/:id/rerun" element={<RerunBatchPage onMessage={onMessage} />} />
          <Route path="/batches/:id" element={<div>Target Batch Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("1 images from Holiday Trip")).toBeDefined();
    });

    const submitBtn = screen.getByRole("button", { name: /Re-run batch/i }) as HTMLButtonElement;
    const form = submitBtn.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Target Batch Page")).toBeDefined();
    });

    expect(onMessage).toHaveBeenCalledWith("Batch created successfully (2 skipped)");
  });

  it("re-run button on BatchDetails is disabled while batch is a draft", () => {
    const draftBatch: Batch = {
      id: "draft-batch-1",
      name: "Draft Batch",
      status: "DRAFT",
      startedAt: null,
      createdAt: "2026-11-04T10:00:00Z",
      config: {},
      whitelistKeys: [],
      whitelistDeletedAt: null,
      jobs: [],
    };

    const { rerender } = render(
      <MemoryRouter>
        <BatchDetails batch={draftBatch} onRefresh={async () => {}} onDelete={() => {}} onMessage={() => {}} />
      </MemoryRouter>,
    );

    const rerunBtn = screen.getByRole("button", { name: /Re-run with new settings/i }) as HTMLButtonElement;
    expect(rerunBtn.disabled).toBe(true);

    // When started and completed, button becomes enabled
    const completedBatch: Batch = {
      ...draftBatch,
      status: "COMPLETED",
      startedAt: "2026-11-04T10:01:00Z",
    };

    rerender(
      <MemoryRouter>
        <BatchDetails batch={completedBatch} onRefresh={async () => {}} onDelete={() => {}} onMessage={() => {}} />
      </MemoryRouter>,
    );

    const updatedRerunBtn = screen.getByRole("button", { name: /Re-run with new settings/i }) as HTMLButtonElement;
    expect(updatedRerunBtn.disabled).toBe(false);
  });

  it("re-run buttons on LibraryPage cards are disabled for draft batches", async () => {
    const mockLibraryResponse = {
      batches: [
        {
          id: "batch-completed",
          name: "Ready Batch",
          status: "COMPLETED" as const,
          createdAt: "2026-11-04T10:00:00Z",
          jobCounts: { total: 2, completed: 2, failed: 0 },
          thumbnailUrl: null,
          bytes: 1000,
        },
        {
          id: "batch-draft",
          name: "Unstarted Batch",
          status: "DRAFT" as const,
          createdAt: "2026-11-04T10:00:00Z",
          jobCounts: { total: 1, completed: 0, failed: 0 },
          thumbnailUrl: null,
          bytes: 500,
        },
      ],
      nextCursor: null,
      usage: { bytes: 1500, batches: 2, jobs: 3 },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/batches")) {
          return {
            ok: true,
            status: 200,
            json: async () => mockLibraryResponse,
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }),
    );

    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Ready Batch")).toBeDefined();
      expect(screen.getByText("Unstarted Batch")).toBeDefined();
    });

    const rerunButtons = screen.getAllByRole("button", { name: /Re-run with new settings/i }) as HTMLButtonElement[];
    expect(rerunButtons).toHaveLength(2);

    // First card (COMPLETED) is enabled
    expect(rerunButtons[0].disabled).toBe(false);
    // Second card (DRAFT) is disabled
    expect(rerunButtons[1].disabled).toBe(true);
  });
});
