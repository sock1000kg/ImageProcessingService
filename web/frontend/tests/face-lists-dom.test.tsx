// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WhitelistUploader } from "../src/components/WhitelistUploader";
import { BatchCreateForm } from "../src/components/BatchCreateForm";
import { LibraryPage } from "../src/pages/LibraryPage";
import { CreateBatchPage } from "../src/pages/CreateBatchPage";
import { RerunBatchPage } from "../src/pages/RerunBatchPage";

describe("Face Lists Frontend DOM Tests (Task 39)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";

        if (url.includes("/api/face-lists") && method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              lists: [
                {
                  id: "list-1",
                  name: "Family List",
                  faceCount: 2,
                  createdAt: "2026-11-05T08:00:00Z",
                },
                {
                  id: "list-2",
                  name: "VIP Team",
                  faceCount: 1,
                  createdAt: "2026-11-05T07:00:00Z",
                },
              ],
            }),
          } as Response;
        }

        if (url.includes("/api/face-lists") && method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              list: {
                id: "list-new",
                name: "New Saved List",
                faceCount: 2,
                createdAt: new Date().toISOString(),
              },
            }),
          } as Response;
        }

        if (url.includes("/api/face-lists/list-1") && method === "DELETE") {
          return {
            ok: true,
            status: 204,
            json: async () => ({}),
          } as Response;
        }

        if (url.includes("/api/batches") && method === "GET") {
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
          blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function makeFile(name: string, type = "image/jpeg", size = 1000): File {
    return new File([new Uint8Array(size)], name, { type, lastModified: 1700000000000 });
  }

  describe("WhitelistUploader: selecting a saved list", () => {
    it("renders saved lists in select, picking a list clears uploaded files and sends faceListId", async () => {
      const onChange = vi.fn();
      const onFaceListIdChange = vi.fn();
      const file1 = makeFile("face1.jpg");

      const { rerender } = render(
        <WhitelistUploader
          files={[file1]}
          onChange={onChange}
          selectedFaceListId={null}
          onFaceListIdChange={onFaceListIdChange}
        />,
      );

      // Wait for saved lists to load into select
      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: "Use a saved list" })).toBeDefined();
      });

      const select = screen.getByRole("combobox", { name: "Use a saved list" });
      expect(select).toBeDefined();
      expect(screen.getByText("Family List (2 faces)")).toBeDefined();

      // Pick "Family List"
      fireEvent.change(select, { target: { value: "list-1" } });

      // Verifies picking a list clears uploaded files and notifies faceListId
      expect(onChange).toHaveBeenCalledWith([]);
      expect(onFaceListIdChange).toHaveBeenCalledWith("list-1");

      // Rerender as parent would with selectedFaceListId="list-1"
      rerender(
        <WhitelistUploader
          files={[]}
          onChange={onChange}
          selectedFaceListId="list-1"
          onFaceListIdChange={onFaceListIdChange}
        />,
      );

      // Shows read-only thumbnails view for list-1
      expect(screen.getByText(/Using saved list:/)).toBeDefined();
      expect(screen.getByText("Family List")).toBeDefined();
      expect(screen.getByText("Face #1")).toBeDefined();
      expect(screen.getByText("Face #2")).toBeDefined();

      // Clicking "Clear" resets to uploading
      const clearBtn = screen.getByRole("button", { name: "Clear" });
      fireEvent.click(clearBtn);
      expect(onFaceListIdChange).toHaveBeenCalledWith(null);
    });

    it("Save as list posts the files with the name and informs user about retention", async () => {
      const onChange = vi.fn();
      const onFaceListIdChange = vi.fn();
      const file1 = makeFile("face1.jpg");
      const file2 = makeFile("face2.jpg");

      render(
        <WhitelistUploader
          files={[file1, file2]}
          onChange={onChange}
          selectedFaceListId={null}
          onFaceListIdChange={onFaceListIdChange}
        />,
      );

      // Copy explaining retention
      expect(screen.getByText("Saved faces are kept under your account until the list is deleted.")).toBeDefined();

      const nameInput = screen.getByRole("textbox", { name: "Face list name" });
      const saveBtn = screen.getByRole("button", { name: "Save as list" });

      // Empty name: save button disabled
      expect(saveBtn.hasAttribute("disabled")).toBe(true);

      // Enter name
      fireEvent.change(nameInput, { target: { value: "My Close Friends" } });
      expect(saveBtn.hasAttribute("disabled")).toBe(false);

      // Click save
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onFaceListIdChange).toHaveBeenCalledWith("list-new");
      });
      expect(onChange).toHaveBeenCalledWith([]);
    });
  });

  describe("BatchCreateForm: submitting with saved face list", () => {
    it("picking a list sends faceListId and no files on submit", async () => {
      const onSubmit = vi.fn().mockResolvedValue({ batch: { id: "new-batch-1" }, failed: [] });

      const { container } = render(
        <MemoryRouter>
          <BatchCreateForm busy={false} error="" onSubmit={onSubmit} />
        </MemoryRouter>,
      );

      // Upload one image file
      const dropzone = container.querySelector("input[type='file']") as HTMLInputElement;
      const img = makeFile("photo.jpg");
      fireEvent.change(dropzone, { target: { files: [img] } });

      // Select saved list
      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: "Use a saved list" })).toBeDefined();
      });
      const select = screen.getByRole("combobox", { name: "Use a saved list" });
      fireEvent.change(select, { target: { value: "list-1" } });

      // Submit the form
      const submitBtn = screen.getByRole("button", { name: "Create secure batch" });
      const form = submitBtn.closest("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      // Verify parameters sent to onSubmit:
      // files = [img], whitelist = [], config, progress, existingBatchId, name, faceListId = "list-1"
      const call = onSubmit.mock.calls[0];
      expect(call[0]).toEqual([img]);
      expect(call[1]).toEqual([]); // no whitelist files!
      expect(call[6]).toBe("list-1"); // faceListId sent!
    });
  });

  describe("LibraryPage: Saved face lists section and delete", () => {
    it("renders saved face lists and deletes list after confirm dialog", async () => {
      render(
        <MemoryRouter>
          <LibraryPage />
        </MemoryRouter>,
      );

      // Wait for face lists to load
      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
        expect(screen.getByText("VIP Team")).toBeDefined();
      });

      expect(screen.getByText("2 faces")).toBeDefined();
      expect(screen.getByText("1 face")).toBeDefined();

      // Find delete button for Family List
      const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(2);

      // Click delete on Family List
      fireEvent.click(deleteButtons[0]);

      // Confirm dialog opens
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Delete this face list?" })).toBeDefined();
      });
      expect(
        screen.getByText(
          "All saved reference faces in this list will be removed from storage immediately. This cannot be undone.",
        ),
      ).toBeDefined();

      // Confirm deletion
      const confirmButton = screen.getByRole("button", { name: "Delete face list" });
      fireEvent.click(confirmButton);

      // List is removed from DOM
      await waitFor(() => {
        expect(screen.queryByText("Family List")).toBeNull();
      });
      expect(screen.getByText("VIP Team")).toBeDefined();
    });
  });
});
