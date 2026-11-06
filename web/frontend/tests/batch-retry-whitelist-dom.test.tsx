// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BatchDetails } from "../src/components/BatchDetails";
import { WhitelistUploader } from "../src/components/WhitelistUploader";
import * as api from "../src/api";
import { Batch } from "../src/types";

describe("Task 53: Frontend batch retry missing faces confirmation and warning note", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mockBatch: Batch = {
    id: "batch-1",
    name: "Test Batch",
    status: "FAILED",
    config: {},
    whitelistKeys: ["lists/user/list1/face-1.jpg", "batch-1/whitelist/face-1.jpg"],
    whitelistDeletedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    jobs: [
      {
        id: "job-1",
        batchId: "batch-1",
        originalFilename: "photo.jpg",
        status: "FAILED",
        progress: 0,
        stage: "DETECTING",
        resultUrl: null,
        resultSummary: null,
        error: { code: "WHITELIST_REFERENCE_ERROR", message: "Face missing" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  it("1. a 409 opens the confirm dialog, and confirming retries with acceptMissingFaces: true", async () => {
    const mockReport: any = {
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
    };

    vi.spyOn(api, "getBatchReport").mockResolvedValue({
      report: mockReport,
    });

    const retrySpy = vi.spyOn(api, "retryJob");
    // First call rejects with 409 WHITELIST_FACES_MISSING
    retrySpy.mockRejectedValueOnce(
      new api.ApiError("Some whitelist faces are no longer available", {
        code: "WHITELIST_FACES_MISSING",
        details: { missing: 1, total: 2 },
        status: 409,
      }),
    );
    // Second call (with flag) resolves
    retrySpy.mockResolvedValueOnce({
      job: {
        ...mockBatch.jobs[0],
        id: "job-retry-1",
        status: "PENDING",
      },
    });

    render(
      <MemoryRouter>
        <BatchDetails batch={mockBatch} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    // Click "Retry job"
    const retryBtn = await screen.findByRole("button", { name: /retry job/i });
    fireEvent.click(retryBtn);

    // Verify dialog opens with the message and "Retry anyway" button
    const confirmBtn = await screen.findByRole("button", { name: /retry anyway/i });
    expect(confirmBtn).toBeDefined();
    expect(screen.getByText(/blur/i)).toBeDefined();

    // Confirm retry
    fireEvent.click(confirmBtn);

    // Verify retryJob was called second time with acceptMissingFaces: true
    await waitFor(() => {
      expect(retrySpy).toHaveBeenCalledTimes(2);
      expect(retrySpy).toHaveBeenNthCalledWith(1, "job-1", undefined);
      expect(retrySpy).toHaveBeenNthCalledWith(2, "job-1", { acceptMissingFaces: true });
    });
  });

  it("2. cancelling the confirm dialog does not retry", async () => {
    const mockReport: any = {
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
    };

    vi.spyOn(api, "getBatchReport").mockResolvedValue({
      report: mockReport,
    });

    const retrySpy = vi.spyOn(api, "retryJob");
    retrySpy.mockRejectedValueOnce(
      new api.ApiError("Some whitelist faces are no longer available", {
        code: "WHITELIST_FACES_MISSING",
        details: { missing: 2, total: 2 },
        status: 409,
      }),
    );

    render(
      <MemoryRouter>
        <BatchDetails batch={mockBatch} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    const retryBtn = await screen.findByRole("button", { name: /retry job/i });
    fireEvent.click(retryBtn);

    const cancelBtn = await screen.findByRole("button", { name: /cancel/i });
    expect(screen.getByText(/blur/i)).toBeDefined();

    fireEvent.click(cancelBtn);

    // Dialog closes and retryJob was called only once
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /retry anyway/i })).toBeNull();
    });
    expect(retrySpy).toHaveBeenCalledTimes(1);
  });

  it("3. the warning note appears only while unsaved faces are selected on the batch form", () => {
    const mockFaceFile = new File(["fake-image-bytes"], "face.jpg", { type: "image/jpeg" });
    const warningNote = /retr(y|ies)/i;

    // Batch form (showSaveAsList=true, default) with no files -> note not shown
    const { rerender } = render(<WhitelistUploader files={[]} onChange={vi.fn()} showSaveAsList={true} />);
    expect(screen.queryByText(warningNote)).toBeNull();

    // Batch form with unsaved files selected -> note shown
    rerender(<WhitelistUploader files={[mockFaceFile]} onChange={vi.fn()} showSaveAsList={true} />);
    expect(screen.getByText(warningNote)).toBeDefined();

    // Overview's new-list form (showSaveAsList=false) with files -> note NOT shown
    rerender(<WhitelistUploader files={[mockFaceFile]} onChange={vi.fn()} showSaveAsList={false} />);
    expect(screen.queryByText(warningNote)).toBeNull();
  });
});
