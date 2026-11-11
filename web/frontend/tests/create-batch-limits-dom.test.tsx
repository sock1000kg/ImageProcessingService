// @vitest-environment happy-dom
/**
 * DOM tests for BatchCreateForm verifying limit removal (>100 files allowed),
 * backend limitReason handling in failure recovery, and rate-limit waitSeconds status alerts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BatchCreateForm } from "../src/components/BatchCreateForm";
import { UploadProgress } from "../src/api";

function makeFile(name: string, type = "image/jpeg", size = 1000): File {
  const blob = new Blob(["a".repeat(size)], { type });
  return new File([blob], name, { type });
}

describe("BatchCreateForm limit handling and rate-limit pause status", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/api/face-lists")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ lists: [] }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("accepts selecting more than 100 images with no limit error message", async () => {
    const onSubmit = vi.fn();
    const { container } = render(<BatchCreateForm busy={false} error="" onSubmit={onSubmit} />);

    // Create 110 valid images
    const files = Array.from({ length: 110 }, (_, i) => makeFile(`photo_${i}.jpg`));
    const dropzoneInput = container.querySelector("input[type='file']") as HTMLInputElement;

    fireEvent.change(dropzoneInput, { target: { files } });

    // Expect 110 files to be accepted
    expect((await screen.findAllByText("110 images selected")).length).toBeGreaterThan(0);
    // No limit error message is displayed
    expect(screen.queryByText(/limit/i)).toBeNull();
    expect(screen.queryByText(/exceed/i)).toBeNull();
  });

  it("shows backend limitReason, how many files not added, hides retry, and keeps Start without them", async () => {
    const file1 = makeFile("photo1.jpg");
    const file2 = makeFile("photo2.jpg");
    const file3 = makeFile("photo3.jpg");

    const onSubmit = vi.fn().mockImplementation(async () => {
      return {
        batch: { id: "batch-lim-1" },
        failed: [file2, file3],
        limitReason: "Batch reached maximum limit of 1000 files.",
      };
    });
    const onStartWithoutFailed = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <BatchCreateForm busy={false} error="" onSubmit={onSubmit} onStartWithoutFailed={onStartWithoutFailed} />,
    );

    // Select files
    const dropzoneInput = container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(dropzoneInput, { target: { files: [file1, file2, file3] } });
    await screen.findByText("photo3.jpg");

    // Submit form
    const form = screen.getByRole("form", { name: /batch/i });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });

    // Verify retry area behavior with limitReason
    const retryArea = screen.getByRole("alert");
    expect(retryArea).toBeDefined();

    // Shows the backend's limit reason
    expect(screen.getByText("Batch reached maximum limit of 1000 files.")).toBeDefined();
    // Shows how many files weren't added
    expect(screen.getByText(/2 files not added/i)).toBeDefined();

    // "Retry failed" button is hidden
    expect(screen.queryByRole("button", { name: /retry failed/i })).toBeNull();

    // "Start without them" button is kept
    const startWithoutBtn = screen.getByRole("button", { name: /start without them/i });
    expect(startWithoutBtn).toBeDefined();

    // Clicking "Start without them" invokes the handler with draftId
    fireEvent.click(startWithoutBtn);
    expect(onStartWithoutFailed).toHaveBeenCalledWith("batch-lim-1");
  });

  it("shows a status message when a progress update contains waitSeconds > 0", async () => {
    const onSubmit = vi.fn().mockImplementation(async (_f, _w, _c, onProgress?: (p: UploadProgress) => void) => {
      // Emit a progress update with waitSeconds
      onProgress?.({ done: 5, total: 20, failed: [], waitSeconds: 4 });
      return new Promise(() => {}); // stay pending
    });

    const file = makeFile("sample.jpg");
    const { container } = render(<BatchCreateForm busy={false} error="" onSubmit={onSubmit} />);

    // Select file and submit
    const dropzoneInput = container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(dropzoneInput, { target: { files: [file] } });
    await screen.findByText("sample.jpg");

    const form = screen.getByRole("form", { name: /batch/i });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });

    // Verify status banner appears with role="status"
    const statusBanners = screen.getAllByRole("status");
    const statusBanner = statusBanners.find((el) => /rate limit/i.test(el.textContent ?? ""));
    expect(statusBanner).toBeDefined();
    expect(statusBanner?.getAttribute("role")).toBe("status");
    expect(statusBanner?.textContent).toMatch(/uploads are paused by the rate limit/i);
    expect(statusBanner?.textContent).toMatch(/4 seconds/i);
    expect(statusBanner?.textContent).toMatch(/nothing is lost/i);
  });
});
