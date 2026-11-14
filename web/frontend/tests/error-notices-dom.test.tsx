// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/App";
import { useBatch } from "../src/hooks/useBatch";
import { BATCH_SYNC_MS, STATS_SYNC_MS, resetSync } from "../src/sync";

describe("Error notices and toast behavior (Task 59)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetSync();
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
    resetSync();
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
                  hasVideo: false,
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

  describe("Connection status overlay instead of polling error notices (Task 60)", () => {
    it("healthy polling never shows a status overlay or alert", async () => {
      vi.useFakeTimers();

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url.includes("/api/batches/batch-healthy-test/report")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                report: {
                  batchId: "batch-healthy-test",
                  totals: { faces: 0, plates: 0, redacted: 0, whitelisted: 0, lowConfidence: 0 },
                  images: [],
                  reviewImages: [],
                  reviewDetections: [],
                },
              }),
            } as Response;
          }

          if (url.includes("/api/batches/batch-healthy-test")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batch: {
                  id: "batch-healthy-test",
                  name: "Healthy Batch",
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

      render(
        <MemoryRouter initialEntries={["/batches/batch-healthy-test"]}>
          <App />
        </MemoryRouter>,
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("heading", { name: /Healthy Batch/i })).toBeDefined();
      expect(screen.getByText(/Live sync · 3s/)).toBeDefined();
      expect(screen.queryByText(/sync lost/i)).toBeNull();
      expect(screen.queryByText(/back in sync/i)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();

      // Poll three times
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS * 3);
      });

      // Still no connection status overlay and no alert
      expect(screen.queryByText(/sync lost/i)).toBeNull();
      expect(screen.queryByText(/back in sync/i)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();

      vi.useRealTimers();
    });

    it("a network failure or 5xx during polling on the batch page shows a status, hides Live sync, and shows no alert", async () => {
      vi.useFakeTimers();

      let shouldFail = false;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url.includes("/api/batches/batch-poll-fail-test/report")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                report: {
                  batchId: "batch-poll-fail-test",
                  totals: { faces: 0, plates: 0, redacted: 0, whitelisted: 0, lowConfidence: 0 },
                  images: [],
                  reviewImages: [],
                  reviewDetections: [],
                },
              }),
            } as Response;
          }

          if (url.includes("/api/batches/batch-poll-fail-test")) {
            if (shouldFail) {
              return {
                ok: false,
                status: 500,
                json: async () => ({ error: { message: "Internal Server Error" } }),
              } as Response;
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batch: {
                  id: "batch-poll-fail-test",
                  name: "Polling Fail Batch",
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

      render(
        <MemoryRouter initialEntries={["/batches/batch-poll-fail-test"]}>
          <App />
        </MemoryRouter>,
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("heading", { name: /Polling Fail Batch/i })).toBeDefined();
      expect(screen.getByText(/Live sync · 3s/)).toBeDefined();
      expect(screen.queryByText(/sync lost/i)).toBeNull();

      // Start outage
      shouldFail = true;

      // Advance by 1 polling interval
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
      });

      // No alert banner
      expect(screen.queryByRole("alert")).toBeNull();

      // Status pill appears with role="status"
      const statusPill = screen.getByText(/sync lost/i);
      expect(statusPill.getAttribute("role")).toBe("status");

      // Live sync indicator in topbar is hidden during outage
      expect(screen.queryByText(/Live sync · 3s/)).toBeNull();

      // Existing batch data is still on screen
      expect(screen.getByRole("heading", { name: /Polling Fail Batch/i })).toBeDefined();

      vi.useRealTimers();
    });

    it("the same on the Overview page, through useSystemStats", async () => {
      vi.useFakeTimers();

      let shouldFail = false;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url.includes("/api/system/stats")) {
            if (shouldFail) {
              return {
                ok: false,
                status: 503,
                json: async () => ({ error: { message: "Service Unavailable" } }),
              } as Response;
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                jobs: { COMPLETED: 5, PROCESSING: 2 },
              }),
            } as Response;
          }

          if (url.includes("/api/batches")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batches: [],
                nextCursor: null,
                usage: { bytes: 0, batches: 0, jobs: 0 },
              }),
            } as Response;
          }

          if (url.includes("/api/face-lists")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ lists: [] }),
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

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText(/Live sync · 5s/)).toBeDefined();
      expect(screen.queryByRole("status")).toBeNull();

      // Start outage on overview stats
      shouldFail = true;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(STATS_SYNC_MS);
      });

      // No alert banner
      expect(screen.queryByRole("alert")).toBeNull();

      // Status pill appears
      const statusPill = screen.getByRole("status");
      expect(statusPill.textContent).toMatch(/sync lost/i);

      // Topbar live sync label is hidden
      expect(screen.queryByText(/Live sync · 5s/)).toBeNull();

      vi.useRealTimers();
    });

    it("several failures in a row leave one status and still no alert", async () => {
      vi.useFakeTimers();

      let shouldFail = true;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url.includes("/api/batches/batch-multi-fail/report")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                report: {
                  batchId: "batch-multi-fail",
                  totals: { faces: 0, plates: 0, redacted: 0, whitelisted: 0, lowConfidence: 0 },
                  images: [],
                  reviewImages: [],
                  reviewDetections: [],
                },
              }),
            } as Response;
          }

          if (url.includes("/api/batches/batch-multi-fail")) {
            if (shouldFail) {
              return {
                ok: false,
                status: 500,
                json: async () => ({ error: { message: "Server Down" } }),
              } as Response;
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batch: {
                  id: "batch-multi-fail",
                  name: "Multi Fail Batch",
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

      // Initial load succeeds
      shouldFail = false;
      render(
        <MemoryRouter initialEntries={["/batches/batch-multi-fail"]}>
          <App />
        </MemoryRouter>,
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("heading", { name: /Multi Fail Batch/i })).toBeDefined();

      // Begin outage
      shouldFail = true;

      // Fail 1st time
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
      });

      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getAllByText(/sync lost/i).length).toBe(1);

      // Fail 2nd and 3rd time
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS * 2);
      });

      // Still exactly one status element, and no alert
      expect(screen.queryByRole("alert")).toBeNull();
      const statusPills = screen.getAllByText(/sync lost/i);
      expect(statusPills.length).toBe(1);
      expect(statusPills[0].getAttribute("role")).toBe("status");

      vi.useRealTimers();
    });

    it("after recovery the status says so, then disappears after the timeout", async () => {
      vi.useFakeTimers();

      let shouldFail = false;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url.includes("/api/batches/batch-recover/report")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                report: {
                  batchId: "batch-recover",
                  totals: { faces: 0, plates: 0, redacted: 0, whitelisted: 0, lowConfidence: 0 },
                  images: [],
                  reviewImages: [],
                  reviewDetections: [],
                },
              }),
            } as Response;
          }

          if (url.includes("/api/batches/batch-recover")) {
            if (shouldFail) {
              return {
                ok: false,
                status: 502,
                json: async () => ({ error: { message: "Bad Gateway" } }),
              } as Response;
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batch: {
                  id: "batch-recover",
                  name: "Recovering Batch",
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

      render(
        <MemoryRouter initialEntries={["/batches/batch-recover"]}>
          <App />
        </MemoryRouter>,
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Trigger outage
      shouldFail = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
      });

      expect(screen.getByText(/sync lost/i).getAttribute("role")).toBe("status");

      // Backend recovers
      shouldFail = false;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
      });

      // Status says back in sync
      const recoveredPill = screen.getByText(/back in sync/i);
      expect(recoveredPill.getAttribute("role")).toBe("status");

      // Live sync returns
      expect(screen.getByText(/Live sync · 3s/)).toBeDefined();

      // Advance past the 3-second recovery notice timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      // Pill disappears completely
      expect(screen.queryByText(/back in sync/i)).toBeNull();
      expect(screen.queryByText(/sync lost/i)).toBeNull();

      vi.useRealTimers();
    });

    it("a poll answering 404 shows the batch's not-found state and no connection status", async () => {
      vi.useFakeTimers();

      let isDeleted = false;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url.includes("/api/batches/batch-404-test/report")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                report: {
                  batchId: "batch-404-test",
                  totals: { faces: 0, plates: 0, redacted: 0, whitelisted: 0, lowConfidence: 0 },
                  images: [],
                  reviewImages: [],
                  reviewDetections: [],
                },
              }),
            } as Response;
          }

          if (url.includes("/api/batches/batch-404-test")) {
            if (isDeleted) {
              return {
                ok: false,
                status: 404,
                json: async () => ({ error: { message: "Batch not found" } }),
              } as Response;
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batch: {
                  id: "batch-404-test",
                  name: "Existing Batch",
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

      render(
        <MemoryRouter initialEntries={["/batches/batch-404-test"]}>
          <App />
        </MemoryRouter>,
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("heading", { name: /Existing Batch/i })).toBeDefined();

      // Batch is deleted elsewhere -> returns 404
      isDeleted = true;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
      });

      // Page shows its existing "Batch not found" state instead of stale data
      expect(screen.getByText(/batch not found/i)).toBeDefined();

      // No connection status pill (because 404 means backend answered)
      expect(screen.queryByText(/sync lost/i)).toBeNull();
      expect(screen.queryByText(/back in sync/i)).toBeNull();

      // No error notice alert toast
      expect(screen.queryByRole("alert")).toBeNull();

      vi.useRealTimers();
    });

    it("leaving a polling page during an outage clears the status", async () => {
      vi.useFakeTimers();

      let shouldFail = false;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url.includes("/api/batches/batch-leave-test/report")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                report: {
                  batchId: "batch-leave-test",
                  totals: { faces: 0, plates: 0, redacted: 0, whitelisted: 0, lowConfidence: 0 },
                  images: [],
                  reviewImages: [],
                  reviewDetections: [],
                },
              }),
            } as Response;
          }

          if (url.includes("/api/batches/batch-leave-test")) {
            if (shouldFail) {
              return {
                ok: false,
                status: 500,
                json: async () => ({ error: { message: "Internal Error" } }),
              } as Response;
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batch: {
                  id: "batch-leave-test",
                  name: "Leaving Test Batch",
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

          if (url.includes("/api/batches")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batches: [],
                nextCursor: null,
                usage: { bytes: 0, batches: 0, jobs: 0 },
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
        <MemoryRouter initialEntries={["/batches/batch-leave-test"]}>
          <App />
        </MemoryRouter>,
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Start outage
      shouldFail = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BATCH_SYNC_MS);
      });

      // Status pill is visible
      expect(screen.getByText(/sync lost/i).getAttribute("role")).toBe("status");

      // Navigate to /library (which has no polling)
      const libraryLink = screen.getByRole("link", { name: /library/i });
      await act(async () => {
        fireEvent.click(libraryLink);
      });

      // Status pill disappears immediately with no "Back in sync"
      expect(screen.queryByText(/sync lost/i)).toBeNull();
      expect(screen.queryByText(/back in sync/i)).toBeNull();

      vi.useRealTimers();
    });

    it("onRefresh failing (network error) causes no alert and no unhandled rejection", async () => {
      let failBatchFetch = false;
      const unhandledRejections: unknown[] = [];
      const onUnhandledRejection = (event: PromiseRejectionEvent) => {
        unhandledRejections.push(event.reason);
      };
      window.addEventListener("unhandledrejection", onUnhandledRejection);

      const onMessage = vi.fn();

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url.includes("/api/batches/batch-onrefresh-fail")) {
            if (failBatchFetch) {
              throw new TypeError("Failed to fetch");
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batch: {
                  id: "batch-onrefresh-fail",
                  name: "OnRefresh Test Batch",
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

      const { result } = renderHook(() => useBatch("batch-onrefresh-fail", onMessage));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.batch?.name).toBe("OnRefresh Test Batch");
      expect(onMessage).not.toHaveBeenCalled();

      // Trigger network failure during manual refreshBatch (the function passed as onRefresh)
      failBatchFetch = true;

      let threw = false;
      await act(async () => {
        try {
          await result.current.refreshBatch();
        } catch {
          threw = true;
        }
      });

      expect(threw).toBe(false);
      expect(unhandledRejections.length).toBe(0);
      expect(onMessage).not.toHaveBeenCalled();

      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    });
  });
});
