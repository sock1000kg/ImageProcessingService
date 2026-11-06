// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BatchDetails } from "../src/components/BatchDetails";
import { LibraryPage } from "../src/pages/LibraryPage";
import { Batch, BatchListResponse } from "../src/types";

describe("Batch Zip Download Frontend DOM Tests (Task 37)", () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;
  let navigatedUrl = "";

  beforeEach(() => {
    navigatedUrl = "";
    delete (window as any).location;
    window.location = {
      ...originalLocation,
      get href() {
        return navigatedUrl;
      },
      set href(val: string) {
        navigatedUrl = val;
      },
    } as any;
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  const mockBatchWithCompleted: Batch = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Completed Album",
    status: "COMPLETED",
    createdAt: "2026-11-04T10:00:00Z",
    startedAt: "2026-11-04T10:01:00Z",
    config: { targets: ["face"], style: "blur", strength: 50 },
    whitelistKeys: [],
    jobs: [
      {
        id: "job-1",
        batchId: "123e4567-e89b-12d3-a456-426614174000",
        originalFilename: "portrait.jpg",
        status: "COMPLETED",
        progress: 100,
        resultUrl: "/results/123/job-1/result.jpg",
        createdAt: "2026-11-04T10:00:10Z",
      },
      {
        id: "job-2",
        batchId: "123e4567-e89b-12d3-a456-426614174000",
        originalFilename: "landscape.jpg",
        status: "COMPLETED",
        progress: 100,
        resultUrl: "/results/123/job-2/result.jpg",
        createdAt: "2026-11-04T10:00:20Z",
      },
    ],
  };

  const mockBatchEmpty: Batch = {
    id: "123e4567-e89b-12d3-a456-426614174001",
    name: "Empty Album",
    status: "DRAFT",
    createdAt: "2026-11-04T10:00:00Z",
    startedAt: null,
    config: { targets: ["face"], style: "blur", strength: 50 },
    whitelistKeys: [],
    jobs: [
      {
        id: "job-3",
        batchId: "123e4567-e89b-12d3-a456-426614174001",
        originalFilename: "pending.jpg",
        status: "PENDING",
        progress: 0,
        resultUrl: null,
        createdAt: "2026-11-04T10:00:10Z",
      },
    ],
  };

  describe("BatchDetails Page Component", () => {
    it("renders download zip button enabled when batch has completed results", () => {
      render(
        <MemoryRouter>
          <BatchDetails batch={mockBatchWithCompleted} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
        </MemoryRouter>,
      );

      const downloadBtn = screen.getByRole("button", { name: /(?:zip|download(?!.*json))/i }) as HTMLButtonElement;
      expect(downloadBtn).toBeDefined();
      expect(downloadBtn.disabled).toBe(false);
    });

    it("disables download zip button when batch has 0 completed results", () => {
      render(
        <MemoryRouter>
          <BatchDetails batch={mockBatchEmpty} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
        </MemoryRouter>,
      );

      const downloadBtn = screen.getByRole("button", { name: /(?:zip|download(?!.*json))/i }) as HTMLButtonElement;
      expect(downloadBtn).toBeDefined();
      expect(downloadBtn.disabled).toBe(true);
    });

    it("clicking 'Download zip' requests download token and navigates window.location", async () => {
      const mockDownloadUrl = "/api/batches/123e4567-e89b-12d3-a456-426614174000/download.zip?token=signed-token-123";

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/report")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ report: null }),
          });
        }
        if (url.includes("/download-token") && init?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ url: mockDownloadUrl }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        });
      });

      render(
        <MemoryRouter>
          <BatchDetails batch={mockBatchWithCompleted} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={vi.fn()} />
        </MemoryRouter>,
      );

      const downloadBtn = screen.getByRole("button", { name: /(?:zip|download(?!.*json))/i });
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(navigatedUrl).toBe(mockDownloadUrl);
      });
    });

    it("shows error via onMessage banner when token endpoint fails", async () => {
      const onMessage = vi.fn();

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/report")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ report: null }),
          });
        }
        if (url.includes("/download-token") && init?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({
              error: { code: "INVALID_DOWNLOAD_TOKEN", message: "Download token generation failed" },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        });
      });

      render(
        <MemoryRouter>
          <BatchDetails batch={mockBatchWithCompleted} onRefresh={vi.fn()} onDelete={vi.fn()} onMessage={onMessage} />
        </MemoryRouter>,
      );

      const downloadBtn = screen.getByRole("button", { name: /(?:zip|download(?!.*json))/i });
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith("Download token generation failed", { variant: "error" });
      });
      expect(navigatedUrl).toBe("");
    });
  });

  describe("LibraryPage Media Library Component", () => {
    const mockLibraryResponse: BatchListResponse = {
      batches: [
        {
          id: "batch-completed-id",
          name: "Album with 3 Completed",
          createdAt: "2026-11-04T08:00:00.000Z",
          status: "COMPLETED",
          jobCounts: { total: 3, completed: 3, failed: 0 },
          thumbnailUrl: null,
          bytes: 1048576,
        },
        {
          id: "batch-empty-id",
          name: "Album with 0 Completed",
          createdAt: "2026-11-04T08:30:00.000Z",
          status: "DRAFT",
          jobCounts: { total: 2, completed: 0, failed: 0 },
          thumbnailUrl: null,
          bytes: 512000,
        },
      ],
      nextCursor: null,
      usage: {
        bytes: 1560576,
        batches: 2,
        jobs: 5,
      },
    };

    it("renders 'Download zip' action on each library card, disabled when completed === 0", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/batches")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockLibraryResponse,
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      });

      render(
        <MemoryRouter>
          <LibraryPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Album with 3 Completed")).toBeDefined();
      });

      // Card 1 has 3 completed -> enabled
      const completedCard = screen.getByRole("article", { name: /Album with 3 Completed/i });
      const completedZipBtn = within(completedCard).getByRole("button", {
        name: /download|zip/i,
      }) as HTMLButtonElement;
      expect(completedZipBtn.disabled).toBe(false);

      // Card 2 has 0 completed -> disabled
      const emptyCard = screen.getByRole("article", { name: /Album with 0 Completed/i });
      const emptyZipBtn = within(emptyCard).getByRole("button", { name: /download|zip/i }) as HTMLButtonElement;
      expect(emptyZipBtn.disabled).toBe(true);
    });

    it("clicking 'Download zip' on library card navigates window.location to download token url", async () => {
      const mockDownloadUrl = "/api/batches/batch-completed-id/download.zip?token=lib-token-456";

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/api/batches/batch-completed-id/download-token") && init?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ url: mockDownloadUrl }),
          });
        }
        if (url.includes("/api/batches")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockLibraryResponse,
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      });

      render(
        <MemoryRouter>
          <LibraryPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Album with 3 Completed")).toBeDefined();
      });

      const completedCard = screen.getByRole("article", { name: /Album with 3 Completed/i });
      const zipBtn = within(completedCard).getByRole("button", { name: /download|zip/i });
      fireEvent.click(zipBtn);

      await waitFor(() => {
        expect(navigatedUrl).toBe(mockDownloadUrl);
      });
    });

    it("shows error banner when downloading zip from library card fails", async () => {
      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/download-token") && init?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({
              error: { code: "SERVER_ERROR", message: "Failed to create download token" },
            }),
          });
        }
        if (url.includes("/api/batches")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockLibraryResponse,
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      });

      const onMessage = vi.fn();

      render(
        <MemoryRouter>
          <LibraryPage onMessage={onMessage} />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Album with 3 Completed")).toBeDefined();
      });

      const completedCard = screen.getByRole("article", { name: /Album with 3 Completed/i });
      const zipBtn = within(completedCard).getByRole("button", { name: /download|zip/i });
      fireEvent.click(zipBtn);

      await waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith("Failed to create download token", { variant: "error" });
      });
      expect(navigatedUrl).toBe("");
    });
  });
});
