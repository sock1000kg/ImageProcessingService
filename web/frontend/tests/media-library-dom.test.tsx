// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LibraryPage } from "../src/pages/LibraryPage";
import { BatchImageList } from "../src/components/BatchImageList";
import { Batch, BatchListResponse } from "../src/types";

describe("Media Library Frontend DOM Tests (Task 36)", () => {
  const originalFetch = global.fetch;

  const mockBatchesPage1: BatchListResponse = {
    batches: [
      {
        id: "batch-1",
        name: "First Album",
        createdAt: "2026-11-04T08:00:00.000Z",
        status: "COMPLETED",
        jobCounts: { total: 2, completed: 2, failed: 0 },
        thumbnailUrl: "/results/batch-1/job-1/result.jpg",
        bytes: 1048576, // 1 MB
      },
      {
        id: "batch-2",
        name: "Second Album",
        createdAt: "2026-11-04T08:30:00.000Z",
        status: "PARTIAL",
        jobCounts: { total: 3, completed: 2, failed: 1 },
        thumbnailUrl: null,
        bytes: 2097152, // 2 MB
      },
    ],
    nextCursor: "cursor-token-page-2",
    usage: {
      bytes: 3145728, // 3 MB
      batches: 2,
      jobs: 5,
    },
  };

  const mockBatchesPage2: BatchListResponse = {
    batches: [
      {
        id: "batch-3",
        name: "Third Album",
        createdAt: "2026-11-04T09:00:00.000Z",
        status: "DRAFT",
        jobCounts: { total: 1, completed: 0, failed: 0 },
        thumbnailUrl: null,
        bytes: 512000,
      },
    ],
    nextCursor: null,
    usage: {
      bytes: 3657728,
      batches: 3,
      jobs: 6,
    },
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/api/batches") && init?.method === "DELETE") {
          return {
            ok: true,
            status: 204,
            json: async () => ({}),
          } as Response;
        }

        if (url.includes("/api/jobs") && init?.method === "DELETE") {
          return {
            ok: true,
            status: 204,
            json: async () => ({}),
          } as Response;
        }

        if (url.includes("/api/batches/batch-1") && init?.method === "PATCH") {
          const body = JSON.parse((init?.body as string) || "{}");
          return {
            ok: true,
            status: 200,
            json: async () => ({
              batch: {
                id: "batch-1",
                name: body.name,
                status: "COMPLETED",
                jobs: [],
                config: {},
                whitelistKeys: [],
                whitelistDeletedAt: null,
                createdAt: "2026-11-04T08:00:00.000Z",
              },
            }),
          } as Response;
        }

        if (url.includes("/api/batches")) {
          if (url.includes("cursor=cursor-token-page-2")) {
            return {
              ok: true,
              status: 200,
              json: async () => mockBatchesPage2,
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => mockBatchesPage1,
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

  it("renders media library items, storage header, thumbnail, and counts", async () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("First Album")).toBeDefined();
    });

    expect(screen.getByText("Second Album")).toBeDefined();
    expect(screen.getByText("Storage used")).toBeDefined();
    expect(screen.getByText("3.0 MB")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined(); // 2 batches

    // Batch 1 has thumbnail image
    const img = screen.getByRole("img", { name: "First Album" }) as HTMLImageElement;
    expect(img.src).toContain("/results/batch-1/job-1/result.jpg");

    // Batch 2 has placeholder
    expect(screen.getByLabelText("No thumbnail")).toBeDefined();

    // Size formatting
    expect(screen.getByText("1.0 MB")).toBeDefined();
    expect(screen.getByText("2.0 MB")).toBeDefined();
  });

  it("supports inline rename of a batch", async () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("First Album")).toBeDefined();
    });

    // Click pencil rename button
    const pencilButtons = screen.getAllByRole("button", { name: "Rename batch" });
    fireEvent.click(pencilButtons[0]);

    // An input appears with the current name
    const input = screen.getByDisplayValue("First Album");
    fireEvent.change(input, { target: { value: "Renamed Album" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Renamed Album")).toBeDefined();
    });
  });

  it("deletes a batch when confirmed through dialog", async () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("First Album")).toBeDefined();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[0]);

    // Dialog opens
    expect(screen.getByRole("heading", { name: "Delete this batch?" })).toBeDefined();

    // Click confirm "Delete batch" inside dialog
    const confirmButton = screen.getByRole("button", { name: "Delete batch" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByText("First Album")).toBeNull();
    });
    expect(screen.getByText("Second Album")).toBeDefined();
  });

  it("loads more batches when clicking 'Load more'", async () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("First Album")).toBeDefined();
    });

    const loadMoreBtn = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText("Third Album")).toBeDefined();
    });
    // Once page 2 is loaded, nextCursor is null, so load more button disappears
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("renders empty state when there are no batches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          batches: [],
          nextCursor: null,
          usage: { bytes: 0, batches: 0, jobs: 0 },
        }),
      })),
    );

    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No batches in library")).toBeDefined();
    });
    expect(screen.getByText("Create a batch to start protecting your media.")).toBeDefined();
  });

  describe("BatchImageList delete button", () => {
    const mockBatch: Batch = {
      id: "test-batch",
      name: "Test Batch",
      status: "PROCESSING",
      config: {},
      whitelistKeys: [],
      whitelistDeletedAt: null,
      createdAt: new Date().toISOString(),
      jobs: [
        {
          id: "job-completed",
          originalFilename: "completed.jpg",
          status: "COMPLETED",
          progress: 100,
          stage: "DONE",
          resultUrl: "/results/1.jpg",
          resultSummary: null,
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "job-active",
          originalFilename: "active.jpg",
          status: "PROCESSING",
          progress: 50,
          stage: "REDACTING",
          resultUrl: null,
          resultSummary: null,
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    it("disables delete button for active jobs and enables it for completed jobs", () => {
      render(
        <MemoryRouter>
          <BatchImageList batch={mockBatch} report={[]} selected="job-completed" onSelect={() => {}} />
        </MemoryRouter>,
      );

      const completedDeleteBtn = screen.getByRole("button", { name: "Delete completed.jpg" });
      const activeDeleteBtn = screen.getByRole("button", { name: "Delete active.jpg" });

      expect((completedDeleteBtn as HTMLButtonElement).disabled).toBe(false);
      expect((activeDeleteBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it("prompts dialog on delete click and calls onJobDeleted on confirmation", async () => {
      const onJobDeletedMock = vi.fn();
      render(
        <MemoryRouter>
          <BatchImageList
            batch={mockBatch}
            report={[]}
            selected="job-completed"
            onSelect={() => {}}
            onJobDeleted={onJobDeletedMock}
          />
        </MemoryRouter>,
      );

      const completedDeleteBtn = screen.getByRole("button", { name: "Delete completed.jpg" });
      fireEvent.click(completedDeleteBtn);

      expect(screen.getByRole("heading", { name: "Delete this image?" })).toBeDefined();

      const confirmBtn = screen.getByRole("button", { name: "Delete image" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(onJobDeletedMock).toHaveBeenCalledWith("job-completed");
      });
    });

    it("navigates to /library when deleting the last job of a batch", async () => {
      const singleJobBatch: Batch = {
        ...mockBatch,
        jobs: [mockBatch.jobs[0]],
      };

      render(
        <MemoryRouter initialEntries={["/batches/test-batch"]}>
          <Routes>
            <Route
              path="/batches/:id"
              element={
                <BatchImageList batch={singleJobBatch} report={[]} selected="job-completed" onSelect={() => {}} />
              }
            />
            <Route path="/library" element={<div>Navigated to Library</div>} />
          </Routes>
        </MemoryRouter>,
      );

      const deleteBtn = screen.getByRole("button", { name: "Delete completed.jpg" });
      fireEvent.click(deleteBtn);

      const confirmBtn = screen.getByRole("button", { name: "Delete image" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText("Navigated to Library")).toBeDefined();
      });
    });

    it("calls onError when deleting an image fails (e.g. 409 conflict or network error)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/api/jobs") && init?.method === "DELETE") {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                error: { code: "JOB_ACTIVE", message: "Cannot delete an active job" },
              }),
            } as Response;
          }
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      const onErrorMock = vi.fn();
      render(
        <MemoryRouter>
          <BatchImageList
            batch={mockBatch}
            report={[]}
            selected="job-completed"
            onSelect={() => {}}
            onError={onErrorMock}
          />
        </MemoryRouter>,
      );

      const deleteBtn = screen.getByRole("button", { name: "Delete completed.jpg" });
      fireEvent.click(deleteBtn);

      const confirmBtn = screen.getByRole("button", { name: "Delete image" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(onErrorMock).toHaveBeenCalledWith("Cannot delete an active job");
      });
    });
  });
});
