// @vitest-environment happy-dom
/**
 * Frontend DOM tests verifying bad reference photo alert, rerun link, retry suppression,
 * and legacy storage key masking (Task 62).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BatchDetails } from "../src/components/BatchDetails";
import { ImageResultViewer } from "../src/components/ImageResultViewer";
import * as api from "../src/api";
import { Batch, Job } from "../src/types";

describe("Bad reference photo banner and retry behaviour (Task 62)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(api, "getBatchReport").mockResolvedValue({
      report: {
        batchId: "batch-1",
        batchName: "Test Batch",
        status: "FAILED",
        totals: {
          images: 1,
          completed: 0,
          failed: 1,
          faces: 0,
          plates: 0,
          redacted: 0,
          whitelisted: 0,
          lowConfidence: 0,
        },
        reviewImages: [],
        reviewDetections: [],
        lowConfidenceDetections: [],
        images: [],
        whitelistPeople: [],
        models: [],
        processingTimeMs: null,
      },
    });
  });

  const createBatchWithJobs = (jobs: Job[]): Batch => ({
    id: "batch-1",
    name: "Test Batch",
    status: "FAILED",
    config: {},
    whitelistKeys: ["lists/user/list/parade.jpg"],
    whitelistDeletedAt: null,
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    jobs,
  });

  it("shows one alert naming the file with a rerun link on a failed batch", async () => {
    const job: Job = {
      id: "job-1",
      batchId: "batch-1",
      originalFilename: "input-1.jpg",
      status: "FAILED",
      progress: 0,
      stage: "PROCESSING",
      resultUrl: null,
      resultSummary: null,
      error: {
        code: "WHITELIST_REFERENCE_ERROR",
        message: "No face detected in whitelist reference image 0_Parade_marchingband_1_511.jpg.",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(
      <MemoryRouter>
        <BatchDetails batch={createBatchWithJobs([job])} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain("0_Parade_marchingband_1_511.jpg");

    // Check rerun link within alert pointing to /batches/:id/rerun
    const rerunLink = screen.getByRole("link", { name: /rerun/i });
    expect(rerunLink).toBeDefined();
    expect(rerunLink.getAttribute("href")).toBe("/batches/batch-1/rerun");
  });

  it("does not repeat the alert message when several jobs fail with the same reference photo", async () => {
    const sharedMessage = "No face detected in whitelist reference image 0_Parade_marchingband_1_511.jpg.";
    const jobs: Job[] = [1, 2, 3].map((num) => ({
      id: `job-${num}`,
      batchId: "batch-1",
      originalFilename: `photo-${num}.jpg`,
      status: "FAILED",
      progress: 0,
      stage: "PROCESSING",
      resultUrl: null,
      resultSummary: null,
      error: {
        code: "WHITELIST_REFERENCE_ERROR",
        message: sharedMessage,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    render(
      <MemoryRouter>
        <BatchDetails batch={createBatchWithJobs(jobs)} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();

    // The filename occurs only once inside the alert banner
    const occurrences = (alert.textContent?.match(/0_Parade_marchingband_1_511\.jpg/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it("renders one alert and one rerun link when several distinct reference errors occur", () => {
    const jobs: Job[] = [
      {
        id: "job-1",
        batchId: "batch-1",
        originalFilename: "photo-1.jpg",
        status: "FAILED",
        progress: 0,
        stage: "PROCESSING",
        resultUrl: null,
        resultSummary: null,
        error: {
          code: "WHITELIST_REFERENCE_ERROR",
          message: "No face detected in whitelist reference image photo-a.jpg.",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "job-2",
        batchId: "batch-1",
        originalFilename: "photo-2.jpg",
        status: "FAILED",
        progress: 0,
        stage: "PROCESSING",
        resultUrl: null,
        resultSummary: null,
        error: {
          code: "WHITELIST_REFERENCE_ERROR",
          message: "No face detected in whitelist reference image photo-b.jpg.",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    render(
      <MemoryRouter>
        <BatchDetails batch={createBatchWithJobs(jobs)} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);

    const rerunLinks = screen.getAllByRole("link", { name: /rerun/i });
    expect(rerunLinks).toHaveLength(1);
    expect(rerunLinks[0].getAttribute("href")).toBe("/batches/batch-1/rerun");
  });

  it("hides 'Retry job' for WHITELIST_REFERENCE_ERROR and keeps it for other failure codes", () => {
    const onRetry = vi.fn();
    const badWhitelistJob: Job = {
      id: "job-bad-ref",
      batchId: "batch-1",
      originalFilename: "input.jpg",
      status: "FAILED",
      progress: 10,
      stage: "PROCESSING",
      resultUrl: null,
      resultSummary: null,
      error: {
        code: "WHITELIST_REFERENCE_ERROR",
        message: "No face detected in whitelist reference image parade.jpg.",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { rerender } = render(
      <MemoryRouter>
        <ImageResultViewer job={badWhitelistJob} detections={[]} reviewReasons={[]} onRetry={onRetry} />
      </MemoryRouter>,
    );

    // "Retry job" must be hidden for WHITELIST_REFERENCE_ERROR
    expect(screen.queryByRole("button", { name: /retry job/i })).toBeNull();
    // Failure detail text remains visible
    expect(screen.getByText(/WHITELIST_REFERENCE_ERROR/)).toBeDefined();
    expect(screen.getByText(/parade\.jpg/)).toBeDefined();

    // Rerender with another failure code where retry should remain available
    const otherFailureJob: Job = {
      ...badWhitelistJob,
      error: {
        code: "MODEL_INFERENCE_ERROR",
        message: "Inference timed out",
      },
    };

    rerender(
      <MemoryRouter>
        <ImageResultViewer job={otherFailureJob} detections={[]} reviewReasons={[]} onRetry={onRetry} />
      </MemoryRouter>,
    );

    // "Retry job" must be visible for other failure codes
    expect(screen.getByRole("button", { name: /retry job/i })).toBeDefined();
  });

  it("does not show an internal storage key for older stored messages", () => {
    const legacyKey = "uploads/lists/user-123/list-456/face-1.jpg";
    const legacyJob: Job = {
      id: "legacy-job",
      batchId: "batch-1",
      originalFilename: "legacy.jpg",
      status: "FAILED",
      progress: 0,
      stage: "PROCESSING",
      resultUrl: null,
      resultSummary: null,
      error: {
        code: "WHITELIST_REFERENCE_ERROR",
        message: `No face detected in whitelist reference image '${legacyKey}'.`,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { rerender } = render(
      <MemoryRouter>
        <BatchDetails
          batch={createBatchWithJobs([legacyJob])}
          onRefresh={vi.fn()}
          onDelete={vi.fn()}
          onMessage={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Banner should not show uploads/ or the key
    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toContain("uploads/");
    expect(alert.textContent).not.toContain(legacyKey);

    // Viewer should not show uploads/ or the key
    rerender(
      <MemoryRouter>
        <ImageResultViewer job={legacyJob} detections={[]} reviewReasons={[]} onRetry={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/uploads\//)).toBeNull();
    expect(screen.queryByText(new RegExp(legacyKey))).toBeNull();
  });

  it("does not show the bad reference alert banner on a batch without WHITELIST_REFERENCE_ERROR", () => {
    const normalJob: Job = {
      id: "job-ok",
      batchId: "batch-1",
      originalFilename: "ok.jpg",
      status: "COMPLETED",
      progress: 100,
      stage: "DONE",
      resultUrl: "/results/batch-1/job-ok/result.jpg",
      resultSummary: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(
      <MemoryRouter>
        <BatchDetails
          batch={{
            ...createBatchWithJobs([normalJob]),
            status: "COMPLETED",
          }}
          onRefresh={vi.fn()}
          onDelete={vi.fn()}
          onMessage={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
