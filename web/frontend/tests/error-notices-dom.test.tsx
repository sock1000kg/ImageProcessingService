// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/App";
import { useBatch } from "../src/hooks/useBatch";
import { BATCH_SYNC_MS } from "../src/sync";

describe("Error notices and toast behavior (Task 59)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({}),
          }) as Response,
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it("a failed action shows an alert that is still there after the success timeout, and dismissing removes it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/batches/batch-err-test") && init?.method === "DELETE") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: { message: "Server delete failure" } }),
          } as Response;
        }

        if (url.includes("/api/batches/batch-err-test/report")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              report: {
                batchId: "batch-err-test",
                totals: { faces: 0, plates: 0, redacted: 0, whitelisted: 0, lowConfidence: 0 },
                images: [],
                reviewImages: [],
                reviewDetections: [],
              },
            }),
          } as Response;
        }

        if (url.includes("/api/batches/batch-err-test")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: {
                id: "batch-err-test",
                name: "Batch Action Test",
                status: "COMPLETED",
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
      <MemoryRouter initialEntries={["/batches/batch-err-test"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Batch Action Test/i })).toBeDefined();
    });

    // Trigger delete action
    const openDeleteBtn = screen.getByRole("button", { name: /delete/i });
    fireEvent.click(openDeleteBtn);

    const dialog = screen.getByRole("dialog");
    const confirmDeleteBtn = within(dialog).getByRole("button", { name: /delete/i });
    fireEvent.click(confirmDeleteBtn);

    // Alert appears with accessible role
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });

    // Wait past the 3-second success timeout: the alert must still be present
    await new Promise((resolve) => setTimeout(resolve, 3200));
    expect(screen.getByRole("alert")).toBeDefined();

    // Dismiss button removes the persistent alert
    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  }, 10_000);

  it("a success notice still disappears on its own", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/batches/batch-succ") && init?.method === "PATCH") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: {
                id: "batch-succ",
                name: "Updated Batch Name",
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
                  id: "batch-succ",
                  name: "Original Batch Name",
                  createdAt: new Date().toISOString(),
                  status: "COMPLETED",
                  jobCounts: { total: 0, completed: 0, failed: 0 },
                  thumbnailUrl: null,
                  bytes: 100,
                },
              ],
              nextCursor: null,
              usage: { bytes: 100, batches: 1, jobs: 0 },
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
      <MemoryRouter initialEntries={["/library"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Original Batch Name")).toBeDefined();
    });

    const renameBtn = screen.getByRole("button", { name: /rename/i });
    fireEvent.click(renameBtn);

    const input = screen.getByDisplayValue("Original Batch Name");
    fireEvent.change(input, { target: { value: "Updated Batch Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Success confirmation appears with role="status"
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeDefined();
    });

    // Auto-hides on its own after the 3-second confirmation timeout
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull(), { timeout: 4000 });
  }, 10_000);

  it("a failed allow-list delete shows an alert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/face-lists/list-delete-fail") && init?.method === "DELETE") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: { message: "Cannot delete allow list" } }),
          } as Response;
        }

        if (url.includes("/api/face-lists")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              lists: [
                {
                  id: "list-delete-fail",
                  name: "Protected Allow List",
                  faceCount: 1,
                  createdAt: new Date().toISOString(),
                },
              ],
            }),
          } as Response;
        }

        if (url.includes("/api/system/stats")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ jobs: {} }),
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
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Protected Allow List")).toBeDefined();
    });

    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    fireEvent.click(deleteBtn);

    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /delete/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
  }, 10_000);

  it("repeated poll failures report once, and a failure after a recovery reports again", async () => {
    vi.useFakeTimers();

    let failRequest = false;
    const onMessage = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/batches/batch-poll-fail-test")) {
          if (failRequest) {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: { message: "Network poll error" } }),
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: {
                id: "batch-poll-fail-test",
                name: "Polling Test",
                status: "PROCESSING",
                jobs: [],
                config: {},
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: new Date().toISOString(),
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

    renderHook(() => useBatch("batch-poll-fail-test", onMessage));

    // Allow initial load to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(onMessage).not.toHaveBeenCalled();

    // Start outage: backend begins failing
    failRequest = true;

    // Advance 1 polling interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
    });

    // First failure triggers error toast
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenLastCalledWith(expect.any(String), { variant: "error" });

    // Advance another 2 polling intervals during the same outage
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS * 2);
    });

    // Still only 1 report (polling does not nag while outage persists)
    expect(onMessage).toHaveBeenCalledTimes(1);

    // Outage resolves: backend recovers
    failRequest = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
    });

    // Still 1 report
    expect(onMessage).toHaveBeenCalledTimes(1);

    // Second outage begins later
    failRequest = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
    });

    // Failure after recovery reports again
    expect(onMessage).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
