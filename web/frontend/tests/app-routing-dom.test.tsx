// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/App";

describe("App Routing and Page Headings", () => {
  const originalFetch = global.fetch;

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

        if (url.includes("/api/batches/batch-123/report")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              report: {
                batchId: "batch-123",
                totals: {
                  faces: 4,
                  plates: 2,
                  redacted: 6,
                  whitelisted: 0,
                  lowConfidence: 0,
                },
                images: [],
                reviewImages: [],
                reviewDetections: [],
              },
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
                status: "PROCESSING",
                config: {},
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
                jobs: [
                  {
                    id: "job-1",
                    originalFilename: "factory.jpg",
                    status: "PROCESSING",
                    progress: 60,
                    stage: "REDACTING",
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
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it("renders the dashboard page heading at route /", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /Your privacy workspace/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /Keep every image private\./i })).toBeDefined();
  });

  it("renders the batch creation heading at route /batches/new", async () => {
    render(
      <MemoryRouter initialEntries={["/batches/new"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /Create a secure batch/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /Processing profile/i })).toBeDefined();
  });

  it("renders the batch page heading at route /batches/:id", async () => {
    render(
      <MemoryRouter initialEntries={["/batches/batch-123"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Alpha Production Run/i })).toBeDefined();
    });
  });

  it("does not render a banner when history carries router state on reload", async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/batches/batch-123", state: { message: "Batch created successfully" } }]}
      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Batch created successfully")).toBeNull();
  });

  it("renders Topbar Refresh button when batch is loaded and triggers refresh", async () => {
    render(
      <MemoryRouter initialEntries={["/batches/batch-123"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh" })).toBeDefined();
    });

    const refreshBtn = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(refreshBtn);

    // Verify fetch was called again for batch-123
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/batches/batch-123", undefined);
    });
  });

  it("displays an error banner when deleting a batch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/batches/batch-123") && init?.method === "DELETE") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: { message: "Delete failed" } }),
          } as Response;
        }

        if (url.includes("/api/batches/batch-123/report")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              report: {
                batchId: "batch-123",
                totals: {
                  faces: 4,
                  plates: 2,
                  redacted: 6,
                  whitelisted: 0,
                  lowConfidence: 0,
                },
                images: [],
                reviewImages: [],
                reviewDetections: [],
              },
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
                status: "PROCESSING",
                config: {},
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
                jobs: [],
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
      <MemoryRouter initialEntries={["/batches/batch-123"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Alpha Production Run/i })).toBeDefined();
    });

    const openDeleteBtn = screen.getByRole("button", { name: "Delete batch" });
    fireEvent.click(openDeleteBtn);

    const dialog = screen.getByRole("dialog");
    const confirmDeleteBtn = within(dialog).getByRole("button", { name: "Delete batch" });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.getByText("Delete failed")).toBeDefined();
    });
  });
});
