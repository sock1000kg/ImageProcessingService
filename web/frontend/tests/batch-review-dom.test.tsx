// @vitest-environment happy-dom
/**
 * Frontend DOM tests for Batch Review screen refinements (Task 72):
 * - Verifies progress bar rendering in PROCESSING vs COMPLETED status
 * - Verifies single non-h1 batch heading
 * - Verifies scrolling into view when selecting images from report vs image list
 * - Verifies resilience when scrollIntoView is undefined
 * - Verifies Open original and Download result link attributes
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BatchDetails } from "../src/components/BatchDetails";
import * as api from "../src/api";
import { Batch, BatchReport, Job } from "../src/types";

// Mock usePrivateImage so original image link renders without network calls
vi.mock("../src/hooks/usePrivateImage", () => ({
  usePrivateImage: vi.fn((path?: string | null) => ({
    url: path ? `blob:http://localhost/mock-${path}` : null,
    loading: false,
    error: false,
  })),
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
        resultUrl: "/api/jobs/job-1/result",
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
        resultUrl: "/api/jobs/job-2/result",
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

  it("renders Open original and Download result as links, with download attribute on result link", () => {
    render(
      <MemoryRouter>
        <BatchDetails batch={createBatch("COMPLETED")} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
      </MemoryRouter>,
    );

    // Why link role: users should be able to open original or trigger download using standard link semantics
    const openOriginalLink = screen.getByRole("link", { name: /open original/i });
    expect(openOriginalLink.tagName).toBe("A");
    expect(openOriginalLink.getAttribute("href")).toContain("/api/jobs/job-1/original");

    const downloadResultLink = screen.getByRole("link", { name: /download result/i });
    expect(downloadResultLink.tagName).toBe("A");
    expect(downloadResultLink.hasAttribute("download")).toBe(true);
    expect(downloadResultLink.getAttribute("href")).toBe("/api/jobs/job-1/result");
  });
});
