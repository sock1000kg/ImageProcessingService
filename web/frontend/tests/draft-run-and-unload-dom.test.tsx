// @vitest-environment happy-dom
/**
 * DOM tests verifying:
 * 1. useWarnBeforeUnload hook and BatchCreateForm beforeunload warning while busy.
 * 2. Running a draft batch from BatchDetails (enabled on drafts with jobs, disabled when empty, Rerun on started).
 * 3. Running a draft batch from LibraryPage (navigating on success, displaying error notice on failure).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BatchCreateForm } from "../src/components/BatchCreateForm";
import { BatchDetails } from "../src/components/BatchDetails";
import { LibraryPage } from "../src/pages/LibraryPage";
import { useWarnBeforeUnload } from "../src/hooks/useWarnBeforeUnload";
import { Batch, Job } from "../src/types";

describe("Task 81: Tab unload warning and draft batch execution", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("useWarnBeforeUnload", () => {
    it("while the form is busy, a dispatched cancelable beforeunload event is defaultPrevented; when idle it isn't", () => {
      const { rerender } = render(<BatchCreateForm busy={false} error="" />);

      const idleEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(idleEvent);
      expect(idleEvent.defaultPrevented).toBe(false);

      rerender(<BatchCreateForm busy={true} error="" />);

      const busyEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(busyEvent);
      expect(busyEvent.defaultPrevented).toBe(true);

      rerender(<BatchCreateForm busy={false} error="" />);

      const idleAgainEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(idleAgainEvent);
      expect(idleAgainEvent.defaultPrevented).toBe(false);
    });

    it("attaches listener only while active, sets returnValue to empty string, and removes listener on unmount", () => {
      function HookHost({ active }: { active: boolean }) {
        useWarnBeforeUnload(active);
        return null;
      }

      const { rerender, unmount } = render(<HookHost active={true} />);

      const activeEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(activeEvent);
      expect(activeEvent.defaultPrevented).toBe(true);
      expect(activeEvent.returnValue).toBe("");

      rerender(<HookHost active={false} />);
      const inactiveEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(inactiveEvent);
      expect(inactiveEvent.defaultPrevented).toBe(false);

      unmount();
      const unmountedEvent = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(unmountedEvent);
      expect(unmountedEvent.defaultPrevented).toBe(false);
    });
  });

  describe("Batch page (BatchDetails)", () => {
    const sampleJob: Job = {
      id: "job-101",
      batchId: "batch-draft-test",
      originalFilename: "sample.jpg",
      inputKey: "uploads/batch-draft-test/job-101/input.jpg",
      status: "PENDING",
      createdAt: "2026-11-04T10:00:00Z",
    };

    const draftBatchWithJobs: Batch = {
      id: "batch-draft-test",
      name: "Draft With Jobs",
      status: "DRAFT",
      startedAt: null,
      createdAt: "2026-11-04T10:00:00Z",
      config: {},
      whitelistKeys: [],
      whitelistDeletedAt: null,
      jobs: [sampleJob],
    };

    const draftBatchEmpty: Batch = {
      id: "batch-draft-empty",
      name: "Empty Draft",
      status: "DRAFT",
      startedAt: null,
      createdAt: "2026-11-04T10:00:00Z",
      config: {},
      whitelistKeys: [],
      whitelistDeletedAt: null,
      jobs: [],
    };

    const startedBatch: Batch = {
      id: "batch-started-test",
      name: "Started Batch",
      status: "PROCESSING",
      startedAt: "2026-11-04T10:01:00Z",
      createdAt: "2026-11-04T10:00:00Z",
      config: {},
      whitelistKeys: [],
      whitelistDeletedAt: null,
      jobs: [sampleJob],
    };

    it("a draft with jobs shows an enabled button named like /^run$/i, and clicking it starts the batch and refreshes", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes(`/api/batches/${draftBatchWithJobs.id}/start`) && init?.method === "POST") {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batch: {
                  ...draftBatchWithJobs,
                  status: "PROCESSING",
                  startedAt: "2026-11-04T10:05:00Z",
                },
              }),
            } as Response;
          }
          if (url.includes("/report")) {
            return { ok: true, status: 200, json: async () => ({ report: null }) } as Response;
          }
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      const onRefresh = vi.fn().mockResolvedValue(undefined);
      const onMessage = vi.fn();

      render(
        <MemoryRouter>
          <BatchDetails batch={draftBatchWithJobs} onRefresh={onRefresh} onDelete={() => {}} onMessage={onMessage} />
        </MemoryRouter>,
      );

      const runButton = screen.getByRole("button", { name: /^run$/i }) as HTMLButtonElement;
      expect(runButton).toBeDefined();
      expect(runButton.disabled).toBe(false);

      fireEvent.click(runButton);

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalledTimes(1);
      });
    });

    it("a draft with no jobs has it disabled", () => {
      render(
        <MemoryRouter>
          <BatchDetails batch={draftBatchEmpty} onRefresh={async () => {}} onDelete={() => {}} onMessage={() => {}} />
        </MemoryRouter>,
      );

      const runButton = screen.getByRole("button", { name: /^run$/i }) as HTMLButtonElement;
      expect(runButton.disabled).toBe(true);
    });

    it("a started batch still shows Rerun", () => {
      render(
        <MemoryRouter>
          <BatchDetails batch={startedBatch} onRefresh={async () => {}} onDelete={() => {}} onMessage={() => {}} />
        </MemoryRouter>,
      );

      const rerunButton = screen.getByRole("button", { name: /^rerun$/i }) as HTMLButtonElement;
      expect(rerunButton).toBeDefined();
      expect(rerunButton.disabled).toBe(false);
    });

    it("calls onMessage with error when starting a draft fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes(`/api/batches/${draftBatchWithJobs.id}/start`) && init?.method === "POST") {
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: { message: "Cannot start empty batch" } }),
            } as Response;
          }
          if (url.includes("/report")) {
            return { ok: true, status: 200, json: async () => ({ report: null }) } as Response;
          }
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      const onRefresh = vi.fn();
      const onMessage = vi.fn();

      render(
        <MemoryRouter>
          <BatchDetails batch={draftBatchWithJobs} onRefresh={onRefresh} onDelete={() => {}} onMessage={onMessage} />
        </MemoryRouter>,
      );

      const runButton = screen.getByRole("button", { name: /^run$/i });
      fireEvent.click(runButton);

      await waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith("Cannot start empty batch", { variant: "error" });
      });
      expect(onRefresh).not.toHaveBeenCalled();
    });
  });

  describe("Library (LibraryPage)", () => {
    const mockLibraryBatches = {
      batches: [
        {
          id: "lib-draft-with-jobs",
          name: "Library Draft With Jobs",
          status: "DRAFT" as const,
          createdAt: "2026-11-04T10:00:00Z",
          jobCounts: { total: 4, completed: 0, failed: 0 },
          thumbnailUrl: null,
          hasVideo: false,
          bytes: 4096,
        },
        {
          id: "lib-draft-empty",
          name: "Library Empty Draft",
          status: "DRAFT" as const,
          createdAt: "2026-11-04T10:00:00Z",
          jobCounts: { total: 0, completed: 0, failed: 0 },
          thumbnailUrl: null,
          hasVideo: false,
          bytes: 0,
        },
        {
          id: "lib-started-batch",
          name: "Library Started Batch",
          status: "COMPLETED" as const,
          createdAt: "2026-11-04T10:00:00Z",
          jobCounts: { total: 2, completed: 2, failed: 0 },
          thumbnailUrl: null,
          hasVideo: false,
          bytes: 2048,
        },
      ],
      nextCursor: null,
      usage: { bytes: 6144, batches: 3, jobs: 6 },
    };

    it("a draft with jobs shows an enabled button named like /^run$/i and clicking it navigates to /batches/:id; draft with no jobs is disabled; started batch shows Rerun", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/api/batches") && (!init || !init.method || init.method === "GET")) {
            return {
              ok: true,
              status: 200,
              json: async () => mockLibraryBatches,
            } as Response;
          }
          if (url.includes("/api/batches/lib-draft-with-jobs/start") && init?.method === "POST") {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                batch: { id: "lib-draft-with-jobs", status: "PROCESSING" },
              }),
            } as Response;
          }
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      const onMessage = vi.fn();

      render(
        <MemoryRouter initialEntries={["/library"]}>
          <Routes>
            <Route path="/library" element={<LibraryPage onMessage={onMessage} />} />
            <Route path="/batches/:id" element={<div>Watched Batch Page</div>} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Library Draft With Jobs")).toBeDefined();
        expect(screen.getByText("Library Empty Draft")).toBeDefined();
        expect(screen.getByText("Library Started Batch")).toBeDefined();
      });

      const draftCardWithJobs = screen.getByRole("article", { name: /Library Draft With Jobs/i });
      const runBtn = within(draftCardWithJobs).getByRole("button", { name: /^run$/i }) as HTMLButtonElement;
      expect(runBtn.disabled).toBe(false);

      const emptyDraftCard = screen.getByRole("article", { name: /Library Empty Draft/i });
      const emptyRunBtn = within(emptyDraftCard).getByRole("button", { name: /^run$/i }) as HTMLButtonElement;
      expect(emptyRunBtn.disabled).toBe(true);

      const startedCard = screen.getByRole("article", { name: /Library Started Batch/i });
      const rerunBtn = within(startedCard).getByRole("button", { name: /^rerun$/i }) as HTMLButtonElement;
      expect(rerunBtn.disabled).toBe(false);

      fireEvent.click(runBtn);

      await waitFor(() => {
        expect(screen.getByText("Watched Batch Page")).toBeDefined();
      });
    });

    it("shows error notice when startBatch fails from LibraryPage", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/api/batches") && (!init || !init.method || init.method === "GET")) {
            return {
              ok: true,
              status: 200,
              json: async () => mockLibraryBatches,
            } as Response;
          }
          if (url.includes("/start") && init?.method === "POST") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: { message: "Internal server error" } }),
            } as Response;
          }
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      const onMessage = vi.fn();

      render(
        <MemoryRouter initialEntries={["/library"]}>
          <Routes>
            <Route path="/library" element={<LibraryPage onMessage={onMessage} />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Library Draft With Jobs")).toBeDefined();
      });

      const draftCard = screen.getByRole("article", { name: /Library Draft With Jobs/i });
      const runBtn = within(draftCard).getByRole("button", { name: /^run$/i });
      fireEvent.click(runBtn);

      await waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith("Internal server error", { variant: "error" });
      });
    });
  });
});
