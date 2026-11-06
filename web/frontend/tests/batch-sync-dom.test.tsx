// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BatchPage } from "../src/pages/BatchPage";
import { BATCH_SYNC_MS } from "../src/sync";

describe("Batch sync and report fetching cadence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("polls the batch every BATCH_SYNC_MS and re-fetches the report only after job status changes", async () => {
    let batchFetchCount = 0;
    let reportFetchCount = 0;
    let jobStatus = "PROCESSING";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/batches/batch-sync-test/report")) {
          reportFetchCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              report: {
                batchId: "batch-sync-test",
                totals: { faces: 1, plates: 0, redacted: 1, whitelisted: 0, lowConfidence: 0 },
                images: [],
                reviewImages: [],
                reviewDetections: [],
              },
            }),
          } as Response;
        }

        if (url.includes("/api/batches/batch-sync-test")) {
          batchFetchCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: {
                id: "batch-sync-test",
                name: "Sync Test Batch",
                status: "PROCESSING",
                config: {},
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
                jobs: [
                  {
                    id: "job-sync-1",
                    originalFilename: "test.jpg",
                    status: jobStatus,
                    progress: jobStatus === "COMPLETED" ? 100 : 50,
                    stage: jobStatus === "COMPLETED" ? "DONE" : "REDACTING",
                    resultUrl: null,
                    resultSummary: null,
                    error: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
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

    render(
      <MemoryRouter initialEntries={["/batches/batch-sync-test"]}>
        <Routes>
          <Route path="/batches/:id" element={<BatchPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Initial mount triggers initial batch fetch and report fetch without advancing the timer
    await act(async () => {});

    expect(screen.getByRole("heading", { name: /Sync Test Batch/i })).toBeDefined();
    expect(batchFetchCount).toBe(1);
    expect(reportFetchCount).toBe(1);

    // Advance by 1 polling interval without any job status change
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
    });

    expect(batchFetchCount).toBe(2);
    // Report should not be re-downloaded because job statuses have not changed
    expect(reportFetchCount).toBe(1);

    // Advance by another polling interval still without job status change
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
    });

    expect(batchFetchCount).toBe(3);
    expect(reportFetchCount).toBe(1);

    // Change job status
    jobStatus = "COMPLETED";

    // Advance timer to trigger next batch fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
    });

    expect(batchFetchCount).toBe(4);
    // Because job status changed from PROCESSING to COMPLETED, the report should now be re-fetched
    expect(reportFetchCount).toBe(2);

    // Advance timer again without further status changes
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
    });

    expect(batchFetchCount).toBe(5);
    expect(reportFetchCount).toBe(2);
  });
});
