// @vitest-environment happy-dom
/**
 * Choosing a folder adds its images to what is already selected, and single files add to a folder, either order.
 * The batch is named after the folder only while the selection is that folder alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BatchCreateForm } from "../src/components/BatchCreateForm";

function image(name: string, folder?: string): File {
  const file = new File([new Blob(["a".repeat(1000)], { type: "image/jpeg" })], name, { type: "image/jpeg" });
  if (folder) Object.defineProperty(file, "webkitRelativePath", { value: `${folder}/${name}` });
  return file;
}

function inputs(container: HTMLElement) {
  return {
    files: container.querySelector("input[type='file']:not([webkitdirectory])") as HTMLInputElement,
    folder: container.querySelector("input[webkitdirectory]") as HTMLInputElement,
  };
}

describe("BatchCreateForm folder selection adds to the selection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ lists: [] }) }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the selected images when a folder is chosen after them", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { container } = render(<BatchCreateForm busy={false} error="" onSubmit={vi.fn()} />);
    const { files, folder } = inputs(container);

    fireEvent.change(files, { target: { files: [image("loose1.jpg"), image("loose2.jpg")] } });
    await screen.findByText(/loose2\.jpg$/);
    fireEvent.change(folder, { target: { files: [image("a.jpg", "trip"), image("b.jpg", "trip")] } });

    expect(await screen.findByText(/b\.jpg$/)).toBeTruthy();
    expect(screen.getByText(/loose1\.jpg$/)).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(/trip/)).toBeNull();
  });

  it("keeps the folder's images when single files are added after it, and names the batch after a lone folder", async () => {
    const { container } = render(<BatchCreateForm busy={false} error="" onSubmit={vi.fn()} />);
    const { files, folder } = inputs(container);

    fireEvent.change(folder, { target: { files: [image("a.jpg", "trip"), image("b.jpg", "trip")] } });
    await screen.findByText(/b\.jpg$/);
    expect(screen.getByPlaceholderText(/trip/)).toBeTruthy();

    fireEvent.change(files, { target: { files: [image("loose1.jpg")] } });

    expect(await screen.findByText(/loose1\.jpg$/)).toBeTruthy();
    expect(screen.getByText(/a\.jpg$/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/trip/)).toBeNull();
  });
});
