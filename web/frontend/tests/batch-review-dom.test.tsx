// @vitest-environment happy-dom
/**
 * Frontend DOM tests for Batch Review screen refinements (Task 72):
 * - Verifies progress bar rendering in PROCESSING vs COMPLETED status
 * - Verifies single non-h1 batch heading
 * - Verifies scrolling into view when selecting images from report vs image list
 * - Verifies resilience when scrollIntoView is undefined
 * - Verifies Open original and Download result link attributes
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BatchDetails } from "../src/components/BatchDetails";
import { formatJobRowStatus, splitFilename } from "../src/components/BatchImageList";
import * as api from "../src/api";
import { Batch, BatchReport, Job } from "../src/types";

// Mock usePresignedUrl so signed images render without network calls
vi.mock("../src/hooks/usePresignedUrl", () => ({
  usePresignedUrl: vi.fn((path?: string | null) => ({
    url: path ? `http://localhost:9000/mock-${path}` : null,
    loading: false,
    error: false,
  })),
  clearPresignedUrlCache: vi.fn(),
}));

describe("Batch review DOM and interaction tests (Task 72)", () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  const createBatch = (status: "PROCESSING" | "COMPLETED" | "QUEUED"): Batch => ({
    id: "batch-105",
    name: "Alpha Batch Review",
    status,
    config: {},
    whitelistKeys: [],
    whitelistDeletedAt: null,
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    jobs: [
      {
        id: "job-1",
        batchId: "batch-105",
        originalFilename: "photo-clean.jpg",
        status: "COMPLETED",
        progress: 100,
        stage: "COMPLETED",
        resultSummary: { faces: 1, plates: 0, redacted: 1, whitelisted: 0, lowConfidence: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "job-2",
        batchId: "batch-105",
        originalFilename: "photo-review.jpg",
        status: "COMPLETED",
        progress: 100,
        stage: "COMPLETED",
        resultSummary: { faces: 1, plates: 0, redacted: 1, whitelisted: 0, lowConfidence: 1 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  });

  const createReport = (): BatchReport => ({
    batchId: "batch-105",
    batchName: "Alpha Batch Review",
    status: "COMPLETED",
    totals: {
      images: 2,
      completed: 2,
      failed: 0,
      faces: 2,
      plates: 0,
      redacted: 2,
      whitelisted: 0,
      lowConfidence: 1,
    },
    reviewImages: [
      {
        jobId: "job-2",
        originalFilename: "photo-review.jpg",
        reviewReasons: ["Low confidence"],
        reviewNotes: ["confidence 0.38 below threshold"],
      },
    ],
    reviewDetections: [],
    lowConfidenceDetections: [],
    images: [
      {
        jobId: "job-1",
        originalFilename: "photo-clean.jpg",
        status: "COMPLETED",
        detections: [],
        reviewReasons: [],
      },
      {
        jobId: "job-2",
        originalFilename: "photo-review.jpg",
        status: "COMPLETED",
        needsReview: true,
        detections: [],
        reviewReasons: ["Low confidence"],
        reviewNotes: ["confidence 0.38 below threshold"],
      },
    ],
    whitelistPeople: [],
    models: [],
    processingTimeMs: 1500,
  });

  beforeEach(() => {
    vi.spyOn(api, "getBatchReport").mockResolvedValue({
      report: createReport(),
    });
  });

  it("shows a progress bar during PROCESSING and omits it when COMPLETED", () => {
    const { unmount } = render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("PROCESSING")} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    // Why progressbar: native <progress> in processing status informs assistive technologies of batch advancement
    const progressBar = screen.getByRole("progressbar", { name: /batch progress/i });
    expect(progressBar).toBeDefined();

    unmount();

    render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("COMPLETED")} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("has exactly one heading matching the batch name, and it is not level 1", () => {
    render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("COMPLETED")} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    // Why non-h1: h1 is reserved for the shell topbar heading; batch title is secondary in the workspace
    const headings = screen.getAllByRole("heading", { name: "Alpha Batch Review" });
    expect(headings).toHaveLength(1);
    expect(headings[0].tagName).not.toBe("H1");
    expect(headings[0].tagName).toBe("H2");
  });

  it("selects image and calls scrollIntoView when clicking a review candidate, but not from the image list", async () => {
    const scrollMock = vi.fn();
    Element.prototype.scrollIntoView = scrollMock;

    render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("COMPLETED")} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    // Initial selected job heading in viewer is photo-clean.jpg
    expect(await screen.findByRole("heading", { name: "photo-clean.jpg" })).toBeDefined();

    // Click candidate row inside Review candidates section
    const reviewRegion = await screen.findByRole("region", { name: /review candidates/i });
    const candidateRow = within(reviewRegion).getByRole("button", { name: /photo-review\.jpg/i });
    fireEvent.click(candidateRow);

    // Why scroll: report sits below the stage, so selecting a review row brings the stage back into view
    expect(scrollMock).toHaveBeenCalledTimes(1);
    expect(scrollMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(screen.getByRole("heading", { name: "photo-review.jpg" })).toBeDefined();

    // Now click the first image in the side list
    scrollMock.mockClear();
    const cleanJobRow = screen.getByText("photo-clean.jpg").closest('[role="button"]');
    expect(cleanJobRow).not.toBeNull();
    fireEvent.click(cleanJobRow!);

    // Why no scroll: image list is already aligned beside the stage, so no scroll jumping is needed
    expect(scrollMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "photo-clean.jpg" })).toBeDefined();
  });

  it("honors prefers-reduced-motion when scrolling stage into view", async () => {
    const scrollMock = vi.fn();
    Element.prototype.scrollIntoView = scrollMock;

    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("COMPLETED")} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    const reviewRegion = await screen.findByRole("region", { name: /review candidates/i });
    const candidateRow = within(reviewRegion).getByRole("button", { name: /photo-review\.jpg/i });
    fireEvent.click(candidateRow);

    // Why auto: prefers-reduced-motion should suppress smooth animations
    expect(scrollMock).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });

  it("does not throw when selecting a report row and scrollIntoView is undefined", async () => {
    // Why undefined check: jsdom and certain older environments lack scrollIntoView implementation
    Element.prototype.scrollIntoView = undefined as unknown as typeof Element.prototype.scrollIntoView;

    render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("COMPLETED")} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    const reviewRegion = await screen.findByRole("region", { name: /review candidates/i });
    const candidateRow = within(reviewRegion).getByRole("button", { name: /photo-review\.jpg/i });

    expect(() => fireEvent.click(candidateRow)).not.toThrow();
    expect(screen.getByRole("heading", { name: "photo-review.jpg" })).toBeDefined();
  });

  it("renders Open original link and Download result button without pre-rendered URLs in DOM, and clicking download requests ?download=1", async () => {
    const requestSpy = vi.spyOn(api, "request").mockResolvedValue({
      url: "http://localhost:9000/results/download.jpg",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("COMPLETED")} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    const openOriginalLink = screen.getByRole("link", { name: /open original/i });
    expect(openOriginalLink.tagName).toBe("A");
    expect(openOriginalLink.getAttribute("href")).toBe("#");

    const downloadResultBtn = screen.getByRole("button", { name: /download result/i });
    expect(downloadResultBtn.tagName).toBe("BUTTON");

    fireEvent.click(downloadResultBtn);
    expect(requestSpy).toHaveBeenCalledWith("/api/jobs/job-1/result-url?download=1");
  });

  it("keeps delete button accessible without selecting row, selects image on row click, and shows review badges", async () => {
    render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("COMPLETED")} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    // Initial selected image heading in viewer is photo-clean.jpg
    expect(await screen.findByRole("heading", { name: "photo-clean.jpg" })).toBeDefined();

    // Why aria-label: delete button must retain its accessible name with filename
    const deleteButton = screen.getByRole("button", { name: "Delete photo-review.jpg" });
    expect(deleteButton).toBeDefined();

    // Clicking delete button opens dialog without selecting photo-review.jpg
    fireEvent.click(deleteButton);
    expect(screen.getByRole("heading", { name: "photo-clean.jpg" })).toBeDefined();
    expect(screen.getByText("Delete this image?")).toBeDefined();

    // Dismiss the delete dialog
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Flagged row renders loose "needs review" and "done" text, with original filename title
    const reviewJobRow = screen.getByTitle("photo-review.jpg").closest('[role="button"]')!;
    expect(reviewJobRow).not.toBeNull();
    expect(await within(reviewJobRow).findByText(/needs review/i)).toBeDefined();
    expect(within(reviewJobRow).getByText(/done/i)).toBeDefined();

    // Clicking the image row selects it and updates the viewer
    fireEvent.click(reviewJobRow);
    expect(screen.getByRole("heading", { name: "photo-review.jpg" })).toBeDefined();
  });

  it("formatJobRowStatus returns distinct text for each status, and includes the progress while processing", () => {
    const completed = formatJobRowStatus({ status: "COMPLETED", progress: 100 });
    const processing = formatJobRowStatus({ status: "PROCESSING", progress: 42 });
    const failed = formatJobRowStatus({ status: "FAILED", progress: 10 });
    const queued = formatJobRowStatus({ status: "QUEUED", progress: 0 });
    const waiting = formatJobRowStatus({ status: "OTHER", progress: 0 });

    expect(completed).toBe("Done");
    expect(processing).toBe("Processing · 42%");
    expect(failed).toBe("Failed");
    expect(queued).toBe("Queued");
    expect(waiting).toBe("Waiting");

    const statuses = [completed, processing, failed, queued, waiting];
    const unique = new Set(statuses);
    expect(unique.size).toBe(statuses.length);
  });

  it("splitFilename rejoins to the original name, keeps a long name's extension in end, and leaves short names whole", () => {
    // Short name (<= 20 chars) left whole
    const short = splitFilename("photo-clean.jpg");
    expect(short.start).toBe("photo-clean.jpg");
    expect(short.end).toBe("");
    expect(short.start + short.end).toBe("photo-clean.jpg");

    // Exact 20 chars boundary
    const twenty = splitFilename("12345678901234567890");
    expect(twenty.start).toBe("12345678901234567890");
    expect(twenty.end).toBe("");
    expect(twenty.start + twenty.end).toBe("12345678901234567890");

    // Long name (> 20 chars)
    const long = splitFilename("super-long-image-filename-2026.png");
    expect(long.end).toBe("e-2026.png");
    expect(long.end.endsWith(".png")).toBe(true);
    expect(long.start + long.end).toBe("super-long-image-filename-2026.png");
  });

  it("a long filename's row keeps the full name in title", async () => {
    const longName = "very-long-camera-image-photo-capture-2026.jpeg";
    const batchWithLongName: Batch = {
      ...createBatch("COMPLETED"),
      jobs: [
        {
          id: "job-long-1",
          batchId: "batch-105",
          originalFilename: longName,
          status: "COMPLETED",
          progress: 100,
          stage: "COMPLETED",
          resultSummary: null,
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    const reportWithLongName: BatchReport = {
      ...createReport(),
      images: [
        {
          jobId: "job-long-1",
          originalFilename: longName,
          status: "COMPLETED",
          progress: 100,
          stage: "COMPLETED",
          resultSummary: null,
          error: null,
          detections: [],
          needsReview: false,
          reviewReasons: [],
          lowestRedactedConfidence: null,
        },
      ],
    };

    vi.spyOn(api, "getBatchReport").mockResolvedValue(reportWithLongName);

    render(
      <MemoryRouter>
        <BatchDetails batch={batchWithLongName} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    const titleElement = await screen.findByTitle(longName);
    expect(titleElement).toBeDefined();
    expect(titleElement.classList.contains("row-name")).toBe(true);
  });

  it("keeps delete dialog open with Deleting button while onDelete is pending, then closes when resolved", async () => {
    let resolveDelete!: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    const onDelete = vi.fn().mockImplementation(() => deletePromise);

    render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("COMPLETED")} onRefresh={vi.fn()} onDelete={onDelete} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    // Click "Delete batch" in header
    const deleteBtn = screen.getByRole("button", { name: /delete batch/i });
    fireEvent.click(deleteBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();

    // Confirm deletion
    const confirmBtn = within(dialog).getByRole("button", { name: /delete batch/i });
    fireEvent.click(confirmBtn);

    expect(onDelete).toHaveBeenCalledTimes(1);

    // Dialog stays open with a "Deleting" button
    expect(within(dialog).getByRole("button", { name: /deleting/i })).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();

    // Cancel does nothing while deleting
    const cancelBtn = within(dialog).getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.getByRole("dialog")).toBeDefined();

    // A second confirm does nothing while deleting
    const deletingBtn = within(dialog).getByRole("button", { name: /deleting/i });
    fireEvent.click(deletingBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeDefined();

    // Resolve the promise
    resolveDelete();

    // Dialog closes
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("stops video playback and unmounts player when confirming batch delete", async () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    let resolveDelete!: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    vi.spyOn(api, "deleteBatch").mockReturnValue(deletePromise);

    const videoBatch: Batch = {
      ...createBatch("COMPLETED"),
      jobs: [
        {
          id: "job-video-1",
          batchId: "batch-105",
          originalFilename: "traffic.mp4",
          status: "COMPLETED",
          progress: 100,
          stage: "COMPLETED",
          resultSummary: {
            video: { width: 1280, height: 720, fps: 30, durationMs: 4000 },
            counts: { faceTracks: 1, plateTracks: 0, redactedTracks: 1 },
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    render(
      <MemoryRouter>
        <BatchDetails
          batch={videoBatch}
          onRefresh={vi.fn()}
          onDelete={() => api.deleteBatch(videoBatch.id)}
          onMessage={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Initial state: video player with label starting with "Redacted" is present
    expect(screen.getByLabelText(/^redacted/i)).toBeDefined();

    // Open delete dialog and confirm
    fireEvent.click(screen.getByRole("button", { name: /delete batch/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /delete batch/i }));

    // Player is gone and pause was called
    expect(screen.queryByLabelText(/^redacted/i)).toBeNull();
    expect(pauseSpy).toHaveBeenCalled();

    resolveDelete();
  });
});
