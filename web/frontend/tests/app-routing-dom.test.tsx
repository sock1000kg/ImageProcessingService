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

    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
  });

  it("renders the batch creation heading at route /batches/new", async () => {
    render(
      <MemoryRouter initialEntries={["/batches/new"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("form", { name: /batch/i })).toBeDefined();
  });

  it("renders the rerun page heading at route /batches/:id/rerun", async () => {
    render(
      <MemoryRouter initialEntries={["/batches/batch-123/rerun"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /run/i })).toBeDefined();
    });
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
        initialEntries={[{ pathname: "/batches/batch-123", state: { message: "Custom test flash message" } }]}
      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Custom test flash message")).toBeNull();
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

    const openDeleteBtn = screen.getByRole("button", { name: /delete/i });
    fireEvent.click(openDeleteBtn);

    const dialog = screen.getByRole("dialog");
    const confirmDeleteBtn = within(dialog).getByRole("button", { name: /delete/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText(/delete failed/i)).toBeDefined();
    });

    // Error alert stays until dismissed: dismissing removes it.
    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText(/delete failed/i)).toBeNull();
    });
  }, 10_000);

  it("displays toast overlay after an action and hides it after timeout", async () => {
    // Mock library fetch and rename endpoints to verify app-wide confirmation banner behavior
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/batches/batch-1") && init?.method === "PATCH") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: {
                id: "batch-1",
                name: "Renamed Album",
                status: "COMPLETED",
                jobs: [],
                config: {},
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
              },
            }),
          } as Response;
        }

        if (url.includes("/api/batches")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batches: [
                {
                  id: "batch-1",
                  name: "First Album",
                  createdAt: new Date().toISOString(),
                  status: "COMPLETED",
                  jobCounts: { total: 1, completed: 1, failed: 0 },
                  thumbnailUrl: null,
                  bytes: 1024,
                },
              ],
              nextCursor: null,
              usage: { bytes: 1024, batches: 1, jobs: 1 },
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

    const { container } = render(
      <MemoryRouter initialEntries={["/library"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("First Album")).toBeDefined();
    });

    // Toast overlay is initially absent to avoid taking up any screen space
    expect(container.querySelector(".toast")).toBeNull();

    // Trigger inline rename action in library to test confirmation flow
    const renameBtn = screen.getByRole("button", { name: /rename/i });
    fireEvent.click(renameBtn);

    const input = screen.getByDisplayValue("First Album");
    fireEvent.change(input, { target: { value: "Renamed Album" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Toast appears inside .toast wrapper with role="status" and confirmation text
    await waitFor(() => {
      const toast = container.querySelector(".toast");
      expect(toast).not.toBeNull();
      expect(screen.getByRole("status")).toBeDefined();
      expect(screen.getByText("Batch renamed")).toBeDefined();
    });

    // The toast disappears after the 3-second confirmation timeout
    await waitFor(() => expect(screen.queryByText("Batch renamed")).toBeNull(), { timeout: 4000 });
    expect(container.querySelector(".toast")).toBeNull();
  }, 10_000);
});
