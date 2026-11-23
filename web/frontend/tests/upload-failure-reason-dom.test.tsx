// @vitest-environment happy-dom
/**
 * A file the server rejects (e.g. a video too long) is not uploaded twice, and the form names the file and the reason.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { uploadBatch } from "../src/api";
import { BatchCreateForm } from "../src/components/BatchCreateForm";

const TOO_LONG = "Video duration must be between 15 and 100 seconds";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("upload failure reasons", () => {
  it("does not retry a file the server rejected and returns the server's reason for it", async () => {
    const good = new File(["a"], "good.jpg", { type: "image/jpeg" });
    const bad = new File(["b"], "bad.jpg", { type: "image/jpeg" });
    let badAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/batches" && init?.method === "POST") {
          return { ok: true, status: 201, json: async () => ({ batch: { id: "b1", status: "DRAFT", jobs: [] } }) };
        }
        if (url.includes("/files") && init?.method === "POST") {
          const file = (init?.body as FormData).get("file") as File;
          if (file.name === "bad.jpg") {
            badAttempts++;
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: { message: TOO_LONG, code: "VIDEO_DURATION_OUT_OF_RANGE" } }),
            };
          }
          return { ok: true, status: 201, json: async () => ({ job: { id: "j1" } }) };
        }
        return { ok: false, status: 404, json: async () => ({ error: { message: "Not found" } }) };
      }),
    );

    const result = await uploadBatch([good, bad], [], { targets: ["face"] });

    expect(result.failed).toEqual([bad]);
    expect(badAttempts).toBe(1);
    expect(result.reasons?.get(bad)).toBe(TOO_LONG);
  });

  it("shows each failed file with its reason, in the alert and in the file list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ lists: [] }) }));
    const video = new File(["v"], "long-clip.mp4", { type: "video/mp4" });
    const onSubmit = vi.fn().mockResolvedValue({
      batch: { id: "b1" },
      failed: [video],
      reasons: new Map([[video, TOO_LONG]]),
    });
    const { container } = render(<BatchCreateForm busy={false} error="" onSubmit={onSubmit} />);

    fireEvent.change(container.querySelector("input[type='file']") as HTMLInputElement, { target: { files: [video] } });
    await screen.findByText("long-clip.mp4");
    fireEvent.submit(screen.getByRole("form", { name: /batch/i }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("long-clip.mp4")).toBeTruthy();
    expect(within(alert).getByText(new RegExp(TOO_LONG))).toBeTruthy();
    expect(screen.getAllByText(TOO_LONG).length).toBeGreaterThan(1);
  });
});
