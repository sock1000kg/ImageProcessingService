// @vitest-environment happy-dom
/**
 * DOM integration tests for redesign phase 5 layout and behaviour (DESIGN.md §8.2, §8.3).
 * Verifies library headings, lazy thumbnails, preview canvas placement on create/rerun,
 * overview heading with creation trigger, and review page details-card scoping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/App";
import { BatchListResponse } from "../src/types";

describe("Pages Layout DOM Integration (Task 73)", () => {
  const originalFetch = global.fetch;

  const mockLibraryBatches: BatchListResponse = {
    batches: [
      {
        id: "batch-1",
        name: "First Album",
        createdAt: "2026-11-04T08:00:00.000Z",
        status: "COMPLETED",
        jobCounts: { total: 2, completed: 2, failed: 0 },
        thumbnailUrl: "/results/batch-1/job-1/result.jpg",
        bytes: 1048576,
      },
    ],
    nextCursor: null,
    usage: {
      bytes: 1048576,
      batches: 1,
      jobs: 2,
    },
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/system/stats")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              jobs: { COMPLETED: 10, PROCESSING: 3, FAILED: 1 },
            }),
          } as Response;
        }

        if (url.includes("/api/face-lists")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              faceLists: [],
            }),
          } as Response;
        }

        if (url.includes("/api/batches/batch-123")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: {
                id: "batch-123",
                name: "Alpha Production Run",
                status: "COMPLETED",
                startedAt: "2026-11-04T08:00:00.000Z",
                config: {
                  style: "blur",
                  strength: 20,
                  targets: ["face", "plate"],
                  padding: 0.1,
                },
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
                jobs: [
                  {
                    id: "job-1",
                    originalFilename: "factory.jpg",
                    status: "COMPLETED",
                    progress: 100,
                    stage: "DONE",
                    resultUrl: "/results/batch-123/job-1/result.jpg",
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

        if (url.includes("/api/batches")) {
          return {
            ok: true,
            status: 200,
            json: async () => mockLibraryBatches,
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
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it("renders library page with single h1 heading, create action link, and lazy thumbnails", async () => {
    render(
      <MemoryRouter initialEntries={["/library"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("First Album")).toBeDefined();
    });

    // Exactly one heading matches "media library" and it's the h1
    const mediaLibraryHeadings = screen.getAllByRole("heading", { name: /media library/i });
    expect(mediaLibraryHeadings).toHaveLength(1);
    expect(mediaLibraryHeadings[0].tagName).toBe("H1");

    // Link to create a batch exists
    const createLink = screen.getByRole("link", { name: /create/i });
    expect(createLink).toBeDefined();
    expect(createLink.getAttribute("href")).toBe("/batches/new");

    // Thumbnail images load lazily
    const thumbnail = screen.getByRole("img", { name: "First Album" });
    expect(thumbnail.getAttribute("loading")).toBe("lazy");
  });

  it("renders batch creation with preview canvas inside form before batch name, not in complementary landmark", async () => {
    render(
      <MemoryRouter initialEntries={["/batches/new"]}>
        <App />
      </MemoryRouter>,
    );

    // Why layout placement: canvas sits in the main form column above the batch name input, not in the sidebar
    const form = screen.getByRole("form", { name: /batch/i });
    const complementary = within(form).getByRole("complementary");
    expect(complementary.querySelector("canvas")).toBeNull();

    const canvas = form.querySelector("canvas");
    expect(canvas).not.toBeNull();
    const batchNameInput = screen.getByLabelText(/batch name/i);
    expect(canvas!.compareDocumentPosition(batchNameInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(complementary).getByRole("heading", { name: /profile/i })).toBeDefined();
  });

  it("renders dashboard overview with exactly one h1 and a working create action", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Keep every image private.")).toBeDefined();
    });

    // Exactly one h1 on /
    const h1Headings = screen.getAllByRole("heading", { level: 1 });
    expect(h1Headings).toHaveLength(1);

    // Create action still works
    const createButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByRole("form", { name: /batch/i })).toBeDefined();
    });
  });

  it("renders batch rerun with preview canvas inside form and not inside the complementary landmark", async () => {
    render(
      <MemoryRouter initialEntries={["/batches/batch-123/rerun"]}>
        <App />
      </MemoryRouter>,
    );

    // Why layout placement: canvas is rendered in the main column above form configuration, not in sticky aside
    const form = await screen.findByRole("form", { name: /batch/i });
    const complementary = within(form).getByRole("complementary");
    expect(complementary.querySelector("canvas")).toBeNull();
    const canvas = form.querySelector("canvas");
    expect(canvas).not.toBeNull();
  });

  it("only mounts .details-card on batch review route (/batches/:id), not on / or /library", async () => {
    // Why class query: CSS rules (.workspace:has(.details-card)) rely on .details-card hook to collapse sidebar to icon rail
    const { unmount: unmountHome } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Keep every image private.");
    expect(document.querySelector(".details-card")).toBeNull();
    unmountHome();

    const { unmount: unmountLibrary } = render(
      <MemoryRouter initialEntries={["/library"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: /media library/i, level: 1 });
    expect(document.querySelector(".details-card")).toBeNull();
    unmountLibrary();

    render(
      <MemoryRouter initialEntries={["/batches/batch-123"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: /Alpha Production Run/i });
    expect(document.querySelector(".details-card")).not.toBeNull();
  });
});
