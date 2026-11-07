// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WhitelistUploader } from "../src/components/WhitelistUploader";
import { BatchCreateForm } from "../src/components/BatchCreateForm";
import { DashboardPage } from "../src/pages/DashboardPage";
import { CreateBatchPage } from "../src/pages/CreateBatchPage";
import { RerunBatchPage } from "../src/pages/RerunBatchPage";
import { DeleteBatchDialog } from "../src/components/DeleteBatchDialog";
import { FaceListViewer } from "../src/components/FaceListViewer";
import { Dialog } from "../src/components/ui/Dialog";
import { SavedFaceListsPanel } from "../src/components/SavedFaceListsPanel";

describe("Face Lists Frontend DOM Tests (Task 39)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";

        if (url.includes("/faces/") && method === "GET") {
          return {
            ok: true,
            status: 200,
            blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
          } as Response;
        }

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
                {
                  id: "list-3",
                  name: "Conference Speakers",
                  faceCount: 3,
                  createdAt: "2026-11-05T06:00:00Z",
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
                name: "New Allow List",
                faceCount: 2,
                createdAt: new Date().toISOString(),
              },
            }),
          } as Response;
        }

        if (url.includes("/api/face-lists/") && method === "PATCH") {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          const id = url.split("/api/face-lists/")[1] ?? "list-1";
          return {
            ok: true,
            status: 200,
            json: async () => ({
              list: {
                id,
                name: body.name || "Renamed List",
                faceCount: 2,
                faceNames: ["Alice", "Bob"],
                createdAt: "2026-11-05T08:00:00Z",
              },
            }),
          } as Response;
        }

        if (url.includes("/api/face-lists/") && method === "DELETE") {
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

  describe("WhitelistUploader: selecting an allow list via picker dialog", () => {
    it("opens large picker dialog, allows toggling Add/Added, and renders removable allow list chips in form", async () => {
      const onChange = vi.fn();
      const onFaceListIdsChange = vi.fn();
      const file1 = makeFile("face1.jpg");

      const { rerender } = render(
        <WhitelistUploader
          files={[file1]}
          onChange={onChange}
          selectedFaceListIds={[]}
          onFaceListIdsChange={onFaceListIdsChange}
        />,
      );

      // Open picker dialog
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /allow list/i })).toBeDefined();
      });
      fireEvent.click(screen.getByRole("button", { name: /allow list/i }));

      // Large dialog opens
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: /allow lists/i })).toBeDefined();

      // Cards render name and thumbnails
      const familyCard = within(dialog).getByRole("article", { name: /Family List/i });
      expect(within(familyCard).getAllByRole("button", { name: /view face/i })).toHaveLength(2);

      // Click Add on Family List
      const addBtn = within(familyCard).getByRole("button", { name: /add/i });
      fireEvent.click(addBtn);

      expect(onFaceListIdsChange).toHaveBeenCalledWith(["list-1"]);

      // Rerender with list-1 added
      rerender(
        <WhitelistUploader
          files={[file1]}
          onChange={onChange}
          selectedFaceListIds={["list-1"]}
          onFaceListIdsChange={onFaceListIdsChange}
        />,
      );

      // In dialog, button now says Added
      const addedButton = within(screen.getByRole("dialog")).getByRole("button", { name: /added/i });
      expect(addedButton).toBeDefined();

      // Close dialog
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /done/i }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });

      // Form shows chosen list as removable card/chip above uploaded files
      expect(screen.getByText("Family List")).toBeDefined();
      expect(screen.getByRole("button", { name: /remove.*family list/i })).toBeDefined();

      // Clicking remove button on chip updates list IDs
      fireEvent.click(screen.getByRole("button", { name: /remove.*family list/i }));
      expect(onFaceListIdsChange).toHaveBeenCalledWith([]);
    });

    it("Save list posts the files with the name", async () => {
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

      const nameInput = screen.getByRole("textbox", { name: /name/i });
      const saveBtn = screen.getByRole("button", { name: /save/i }) as HTMLButtonElement;

      // Empty name: save button disabled
      expect(saveBtn.disabled).toBe(true);

      // Enter name
      fireEvent.change(nameInput, { target: { value: "My Close Friends" } });
      expect(saveBtn.disabled).toBe(false);

      // Click save
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onFaceListIdChange).toHaveBeenCalledWith("list-new");
      });
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it("disables Add button in picker dialog when adding a list would exceed 20 faces", async () => {
      // 19 uploaded files currently in form
      const nineteenFiles = Array.from({ length: 19 }, (_, i) => makeFile(`face${i + 1}.jpg`));

      render(
        <WhitelistUploader
          files={nineteenFiles}
          onChange={vi.fn()}
          selectedFaceListIds={[]}
          onFaceListIdsChange={vi.fn()}
        />,
      );

      // Open picker
      fireEvent.click(screen.getByRole("button", { name: /allow list/i }));
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });

      const dialog = screen.getByRole("dialog");
      // "Family List" has 2 faces (19 + 2 = 21 > 20) -> Add should be disabled with reason
      const familyCard = within(dialog).getByRole("article", { name: /Family List/i });
      const addBtn = within(familyCard).getByRole("button", { name: /add/i }) as HTMLButtonElement;
      expect(addBtn.disabled).toBe(true);

      // "VIP Team" has 1 face (19 + 1 = 20 <= 20) -> Add should be enabled
      const vipCard = within(dialog).getByRole("article", { name: /VIP Team/i });
      const vipAddBtn = within(vipCard).getByRole("button", { name: /add/i }) as HTMLButtonElement;
      expect(vipAddBtn.disabled).toBe(false);
    });
  });

  describe("BatchCreateForm: submitting with allow lists and uploads", () => {
    it("picker opens, Add two lists → submit sends both ids + uploaded files", async () => {
      const onSubmit = vi.fn().mockResolvedValue({ batch: { id: "new-batch-1" }, failed: [] });

      const { container } = render(
        <MemoryRouter>
          <BatchCreateForm busy={false} error="" onSubmit={onSubmit} />
        </MemoryRouter>,
      );

      // Upload one image file via dropzone input
      const dropzone = container.querySelectorAll("input[type='file']")[0] as HTMLInputElement;
      const img = makeFile("photo.jpg");
      fireEvent.change(dropzone, { target: { files: [img] } });

      // Add a whitelist upload file
      const whitelistInput = screen.getByLabelText(/references/i) as HTMLInputElement;
      const wlFile = makeFile("whitelist-ref.jpg");
      fireEvent.change(whitelistInput, { target: { files: [wlFile] } });

      // Open allow list picker dialog
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /allow list/i })).toBeDefined();
      });
      fireEvent.click(screen.getByRole("button", { name: /allow list/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });
      const dialog = screen.getByRole("dialog");

      // Click Add on Family List (list-1) and VIP Team (list-2)
      const familyCard = within(dialog).getByRole("article", { name: /Family List/i });
      fireEvent.click(within(familyCard).getByRole("button", { name: /add/i }));

      const vipCard = within(dialog).getByRole("article", { name: /VIP Team/i });
      fireEvent.click(within(vipCard).getByRole("button", { name: /add/i }));

      // Close dialog
      fireEvent.click(within(dialog).getByRole("button", { name: /done/i }));

      // Submit the form
      const form = screen.getByRole("form", { name: /batch/i });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      // Verify parameters sent to onSubmit:
      // files = [img], whitelist = [wlFile], config, progress, existingBatchId, name, faceListId = "list-1", faceListIds = ["list-1", "list-2"]
      const call = onSubmit.mock.calls[0];
      expect(call[0]).toEqual([img]);
      expect(call[1]).toEqual([wlFile]); // uploaded whitelist file sent!
      expect(call[6]).toBe("list-1"); // alias faceListId
      expect(call[7]).toEqual(["list-1", "list-2"]); // both allow list IDs sent!
    });
  });

  describe("DashboardPage: Allow lists section, delete, and new list form", () => {
    it("renders allow lists on overview and deletes list after confirm dialog", async () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      // Heading is Allow lists
      expect(screen.getByRole("heading", { name: /allow lists/i })).toBeDefined();

      // Wait for allow lists to load
      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
        expect(screen.getByText("VIP Team")).toBeDefined();
      });

      // Find Family List and VIP Team cards by article role
      const familyCard = screen.getByRole("article", { name: /Family List/i });
      expect(within(familyCard).getAllByRole("button", { name: /view face/i })).toHaveLength(2);

      const vipCard = screen.getByRole("article", { name: /VIP Team/i });
      expect(within(vipCard).getAllByRole("button", { name: /view face/i })).toHaveLength(1);

      // Find delete button for Family List
      const deleteBtn = within(familyCard).getByRole("button", { name: /delete/i });
      fireEvent.click(deleteBtn);

      // Confirm dialog opens
      await waitFor(() => {
        expect(within(screen.getByRole("dialog")).getByRole("heading", { name: /delete/i })).toBeDefined();
      });

      // Confirm deletion
      const confirmButton = within(screen.getByRole("dialog")).getByRole("button", { name: /delete/i });
      fireEvent.click(confirmButton);

      // List is removed from DOM
      await waitFor(() => {
        expect(screen.queryByText("Family List")).toBeNull();
      });
      expect(screen.getByText("VIP Team")).toBeDefined();
    });

    it("creates a new allow list via the form on overview and updates the list", async () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      // Heading is "Create an allow list"
      expect(screen.getByRole("heading", { name: /create.*allow list/i })).toBeDefined();

      // Name input
      const nameInput = screen.getByRole("textbox", { name: /name/i });
      fireEvent.change(nameInput, { target: { value: "Colleagues" } });

      // Add face files via file picker
      const fileInput = screen.getByLabelText(/references/i) as HTMLInputElement;
      expect(fileInput).toBeDefined();
      const face1 = makeFile("face1.jpg");
      fireEvent.change(fileInput, { target: { files: [face1] } });

      // Submit the form with "Save list" button
      const saveBtn = screen.getByRole("button", { name: /save/i });
      expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText("New Allow List")).toBeDefined();
      });
    });

    it("View opens the dialog with the list name and N thumbnails, clicking thumbnail 3 shows face 3 large, arrow keys switch faces, Esc and Close close it", async () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Conference Speakers")).toBeDefined();
      });

      const confCard = screen.getByRole("article", { name: /Conference Speakers/i });
      const viewBtn = within(confCard).getByRole("button", { name: /view(?!.*face)/i });

      // Click "View" on Conference Speakers (which has 3 faces)
      fireEvent.click(viewBtn);

      // Dialog opens with title containing list name and face count
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: /Conference Speakers/i })).toBeDefined();

      // N thumbnails are rendered in the strip
      const strip = within(dialog).getByRole("region", { name: /thumbnails/i });
      const stripThumbs = within(strip).getAllByRole("button");
      expect(stripThumbs).toHaveLength(3);
      expect(stripThumbs[0].getAttribute("aria-label")).toBe("Thumbnail 1");
      expect(stripThumbs[1].getAttribute("aria-label")).toBe("Thumbnail 2");
      expect(stripThumbs[2].getAttribute("aria-label")).toBe("Thumbnail 3");

      // Initially face #1 is shown large
      await waitFor(() => {
        expect(within(dialog).getByAltText("Face #1")).toBeDefined();
      });

      // Clicking thumbnail 3 shows face 3 large
      fireEvent.click(stripThumbs[2]);
      await waitFor(() => {
        expect(within(dialog).getByAltText("Face #3")).toBeDefined();
      });

      // ArrowLeft switches to face 2
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      await waitFor(() => {
        expect(within(dialog).getByAltText("Face #2")).toBeDefined();
      });

      // ArrowRight switches back to face 3
      fireEvent.keyDown(window, { key: "ArrowRight" });
      await waitFor(() => {
        expect(within(dialog).getByAltText("Face #3")).toBeDefined();
      });

      // Pressing Esc closes the dialog
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });

      // Re-open via View button to test Close button
      fireEvent.click(viewBtn);
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });

      // Clicking Close button closes the dialog
      const closeBtn = within(screen.getByRole("dialog")).getByRole("button", { name: /close/i });
      fireEvent.click(closeBtn);
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("clicking a card thumbnail opens the viewer directly on that face", async () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Conference Speakers")).toBeDefined();
      });

      // Click card thumbnail for face #2
      const cardThumb = screen.getByRole("button", { name: /face #2 from Conference Speakers/i });
      fireEvent.click(cardThumb);

      // Dialog opens directly on face #2
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: /Conference Speakers/i })).toBeDefined();

      await waitFor(() => {
        expect(within(dialog).getByAltText("Face #2")).toBeDefined();
      });

      // Clicking backdrop closes the dialog
      const backdrop = screen.getByRole("presentation");
      fireEvent.click(backdrop);
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });
  });

  describe("DeleteBatchDialog component", () => {
    it("renders title, body, confirms, cancels, and dismisses on Esc or backdrop click", () => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();

      const { rerender } = render(
        <DeleteBatchDialog
          open={true}
          title="Delete custom title?"
          body="Custom warning message"
          confirmLabel="Do Delete"
          onCancel={onCancel}
          onConfirm={onConfirm}
        />,
      );

      expect(screen.getByRole("heading", { name: /delete custom title/i })).toBeDefined();
      expect(screen.getByText("Custom warning message")).toBeDefined();

      // Click Confirm
      const confirmBtn = screen.getByRole("button", { name: /do delete/i });
      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalledTimes(1);

      // Click Cancel
      const cancelBtn = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);

      // Backdrop click dismisses
      const backdrop = screen.getByRole("presentation");
      fireEvent.click(backdrop);
      expect(onCancel).toHaveBeenCalledTimes(2);

      // Esc key dismisses
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onCancel).toHaveBeenCalledTimes(3);

      // open={false} renders nothing
      rerender(<DeleteBatchDialog open={false} onCancel={onCancel} onConfirm={onConfirm} />);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("FaceListViewer component", () => {
    it("renders error state on fetch failure", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", fetchMock);

      const list = {
        id: "list-err",
        name: "Broken List",
        faceCount: 1,
        createdAt: "2026-11-05T00:00:00Z",
      };

      render(<FaceListViewer list={list} onClose={vi.fn()} />);

      const dialog = screen.getByRole("dialog");
      await waitFor(() => {
        expect(within(dialog).getByRole("alert")).toBeDefined();
      });

      expect(within(dialog).queryAllByRole("img")).toHaveLength(0);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/face-lists/list-err/faces/1"),
        expect.anything(),
      );
    });

    it("shows the API's name for the active face and changes it when switching", async () => {
      const list = {
        id: "list-with-names",
        name: "Key Personnel",
        faceCount: 2,
        faceNames: ["ảnh Đức.jpg", "portrait-bob.png"],
        createdAt: "2026-11-06T00:00:00Z",
      };

      render(<FaceListViewer list={list} onClose={vi.fn()} />);

      const dialog = screen.getByRole("dialog");

      // Initially active on face 1
      await waitFor(() => {
        const stageImg = within(dialog).getByAltText("ảnh Đức.jpg");
        expect(stageImg).toBeDefined();
      });

      // Photo label under image shows photo name with title tooltip
      const label1 = within(dialog).getByText("ảnh Đức.jpg");
      expect(label1.getAttribute("title")).toBe("ảnh Đức.jpg");

      // Strip thumbnails get the name as title
      const thumb1 = within(dialog).getByRole("button", { name: "Thumbnail 1" });
      const thumb2 = within(dialog).getByRole("button", { name: "Thumbnail 2" });
      expect(thumb1.getAttribute("title")).toBe("ảnh Đức.jpg");
      expect(thumb2.getAttribute("title")).toBe("portrait-bob.png");

      // Switch to face 2
      fireEvent.click(thumb2);

      await waitFor(() => {
        const stageImg2 = within(dialog).getByAltText("portrait-bob.png");
        expect(stageImg2).toBeDefined();
      });

      const label2 = within(dialog).getByText("portrait-bob.png");
      expect(label2.getAttribute("title")).toBe("portrait-bob.png");
    });

    it("opens and labels faces gracefully for a list without names", async () => {
      const list = {
        id: "list-legacy",
        name: "Legacy Faces",
        faceCount: 2,
        createdAt: "2026-11-05T00:00:00Z",
      };

      render(<FaceListViewer list={list} onClose={vi.fn()} />);

      const dialog = screen.getByRole("dialog");

      // Falls back to "Face #1"
      await waitFor(() => {
        expect(within(dialog).getByAltText("Face #1")).toBeDefined();
      });

      const label1 = dialog.querySelector(".face-viewer-label");
      expect(label1?.textContent).toBe("Face #1");
      expect(label1?.getAttribute("title")).toBe("Face #1");

      const thumb1 = within(dialog).getByRole("button", { name: "Thumbnail 1" });
      const thumb2 = within(dialog).getByRole("button", { name: "Thumbnail 2" });
      expect(thumb1.getAttribute("title")).toBe("Face #1");
      expect(thumb2.getAttribute("title")).toBe("Face #2");

      // Switch to face 2
      fireEvent.click(thumb2);

      await waitFor(() => {
        expect(within(dialog).getByAltText("Face #2")).toBeDefined();
      });
      const label2 = dialog.querySelector(".face-viewer-label");
      expect(label2?.textContent).toBe("Face #2");
      expect(label2?.getAttribute("title")).toBe("Face #2");
    });

    it("names the photo in the delete dialog and trash button aria-label", async () => {
      const list = {
        id: "list-delete-name",
        name: "Security Whitelist",
        faceCount: 2,
        faceNames: ["ảnh Đức.jpg", "portrait-bob.png"],
        createdAt: "2026-11-06T00:00:00Z",
      };

      render(<FaceListViewer list={list} onDeleteFace={vi.fn()} onClose={vi.fn()} />);

      // Trash button uses active photo name
      const trashBtn = screen.getByRole("button", { name: "Delete ảnh Đức.jpg" });
      expect(trashBtn).toBeDefined();

      // Click trash to open delete dialog
      fireEvent.click(trashBtn);

      // Delete dialog body names the photo
      expect(screen.getByText(/ảnh Đức\.jpg will be removed from this allow list immediately/i)).toBeDefined();
    });
  });

  describe("Task 49: Add faces to existing allow list in SavedFaceListsPanel", () => {
    it("picking files on a card calls the API with that list's id and the card then shows the new faces", async () => {
      const onMessage = vi.fn();
      let postedFormData: FormData | null = null;
      let requestedUrl = "";

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";

          if (url.includes("/api/face-lists/list-1/faces") && method === "POST") {
            requestedUrl = url;
            postedFormData = init?.body as FormData;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                list: {
                  id: "list-1",
                  name: "Family List",
                  faceCount: 4,
                  createdAt: "2026-11-05T08:00:00Z",
                },
              }),
            } as Response;
          }

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
                ],
              }),
            } as Response;
          }

          if (url.includes("/faces/") && method === "GET") {
            return {
              ok: true,
              status: 200,
              blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
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
        <MemoryRouter>
          <SavedFaceListsPanel onMessage={onMessage} />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      const card = screen.getByRole("article", { name: /Family List/i });
      expect(within(card).getByText(/2 (?:file|face)s/)).toBeDefined();

      const addBtn = within(card).getByRole("button", { name: /add faces/i });
      expect((addBtn as HTMLButtonElement).disabled).toBe(false);

      // Trigger file picker
      fireEvent.click(addBtn);

      const fileInput = container.querySelector("input[type='file'][hidden]") as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      const newFiles = [makeFile("extra1.jpg"), makeFile("extra2.png", "image/png")];
      fireEvent.change(fileInput, { target: { files: newFiles } });

      await waitFor(() => {
        expect(requestedUrl).toContain("/api/face-lists/list-1/faces");
      });

      expect(postedFormData).not.toBeNull();
      const uploadedFiles = postedFormData!.getAll("faces");
      expect(uploadedFiles).toHaveLength(2);

      // Card now updates to reflect 4 faces and new thumbnails
      await waitFor(() => {
        expect(within(card).getByText(/4 (?:file|face)s/)).toBeDefined();
      });

      const thumbnails = within(card).getAllByRole("button", { name: /view face #/i });
      expect(thumbnails).toHaveLength(4);
      expect(onMessage).toHaveBeenCalledWith("Allow list updated");
    });

    it("a full list's button is disabled with a descriptive title", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/api/face-lists")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                lists: [
                  {
                    id: "list-full",
                    name: "Full Team",
                    faceCount: 5,
                    createdAt: "2026-11-05T08:00:00Z",
                  },
                ],
              }),
            } as Response;
          }
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      render(
        <MemoryRouter>
          <SavedFaceListsPanel />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Full Team")).toBeDefined();
      });

      const card = screen.getByRole("article", { name: /Full Team/i });
      const addBtn = within(card).getByRole("button", { name: /add faces/i }) as HTMLButtonElement;
      expect(addBtn.disabled).toBe(true);
      expect(addBtn.title).toMatch(/full/i);
    });

    it("a list with 4 faces and 3 picked files uploads 1 and rejects 2, and the notice mentions the limit (/5/), not the spots left", async () => {
      let requestedUrl = "";
      let requestedFormData: FormData | null = null;

      const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";

        if (url.includes("/faces") && method === "POST") {
          requestedUrl = url;
          requestedFormData = init?.body as FormData;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              list: {
                id: "list-1",
                name: "Four Faces List",
                faceCount: 5,
                createdAt: "2026-11-05T08:00:00Z",
              },
            }),
          } as Response;
        }

        if (url.includes("/api/face-lists") && method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              lists: [
                {
                  id: "list-1",
                  name: "Four Faces List",
                  faceCount: 4,
                  createdAt: "2026-11-05T08:00:00Z",
                },
              ],
            }),
          } as Response;
        }

        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      vi.stubGlobal("fetch", fetchSpy);

      const { container } = render(
        <MemoryRouter>
          <SavedFaceListsPanel />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Four Faces List")).toBeDefined();
      });

      const card = screen.getByRole("article", { name: /Four Faces List/i });
      const addBtn = within(card).getByRole("button", { name: /add faces/i });
      fireEvent.click(addBtn);

      const fileInput = container.querySelector("input[type='file'][hidden]") as HTMLInputElement;

      // Select 3 files when 4 already exist (1 fits, 2 overflow)
      const incoming = [makeFile("f1.jpg"), makeFile("f2.jpg"), makeFile("f3.jpg")];
      fireEvent.change(fileInput, { target: { files: incoming } });

      // Notice should be displayed showing rejection mentioning limit (/5/) not spots left (/1/)
      await waitFor(() => {
        expect(screen.getByRole("status")).toBeDefined();
        const rejectedItems = screen.getAllByText(/5 reference (?:file|face)s allowed/i);
        expect(rejectedItems).toHaveLength(2);
      });

      // 1 file is uploaded via POST
      await waitFor(() => {
        expect(requestedUrl).toContain("/api/face-lists/list-1/faces");
      });
      expect(requestedFormData).not.toBeNull();
      const uploadedFaces = requestedFormData!.getAll("faces");
      expect(uploadedFaces).toHaveLength(1);

      // Card count is updated to 5 faces
      await waitFor(() => {
        expect(within(card).getByText(/5 (?:file|face)s/)).toBeDefined();
      });
    });

    it("API failure → error shown, count unchanged", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";

          if (url.includes("/api/face-lists/list-1/faces") && method === "POST") {
            return {
              ok: false,
              status: 409,
              json: async () => ({ error: { code: "FACE_LIST_FULL", message: "Allow list is full" } }),
              text: async () => JSON.stringify({ error: { code: "FACE_LIST_FULL", message: "Allow list is full" } }),
            } as Response;
          }

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
                ],
              }),
            } as Response;
          }

          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      const { container } = render(
        <MemoryRouter>
          <SavedFaceListsPanel />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      const card = screen.getByRole("article", { name: /Family List/i });
      const addBtn = within(card).getByRole("button", { name: /add faces/i });
      fireEvent.click(addBtn);

      const fileInput = container.querySelector("input[type='file'][hidden]") as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [makeFile("extra.jpg")] } });

      // Error banner shown
      await waitFor(() => {
        expect(screen.getByText(/allow list is full/i)).toBeDefined();
      });

      // Count remains 2 faces
      expect(within(card).getByText(/2 (?:file|face)s/)).toBeDefined();
    });
  });

  describe("Delete single face from allow list (Task 50)", () => {
    it("the trash button asks first, and cancelling calls nothing", async () => {
      const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";

        if (url.includes("/faces/") && method === "GET") {
          return {
            ok: true,
            status: 200,
            blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
          } as Response;
        }

        if (url.includes("/api/face-lists") && method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              lists: [
                {
                  id: "list-1",
                  name: "Family List",
                  faceCount: 3,
                  createdAt: "2026-11-05T08:00:00Z",
                },
              ],
            }),
          } as Response;
        }

        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      vi.stubGlobal("fetch", fetchSpy);

      render(
        <MemoryRouter>
          <SavedFaceListsPanel />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      // Open viewer
      const viewBtn = screen.getByRole("button", { name: /^view$/i });
      fireEvent.click(viewBtn);

      // Trash button for active face #1 is visible
      const trashBtn = screen.getByRole("button", { name: "Delete face #1" });
      expect(trashBtn).toBeDefined();

      // Click trash button -> confirm dialog opens
      fireEvent.click(trashBtn);
      expect(screen.getByText("Delete this face?")).toBeDefined();

      // Cancel button closes confirm dialog and calls nothing
      const cancelBtn = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelBtn);

      expect(screen.queryByText("Delete this face?")).toBeNull();

      const deleteCalls = fetchSpy.mock.calls.filter(([callUrl, callInit]) => {
        return (callInit as any)?.method === "DELETE";
      });
      expect(deleteCalls).toHaveLength(0);
    });

    it("confirming calls the API with that list and face, and the viewer then requests the next photo rather than showing the old one", async () => {
      const requestedUrls: string[] = [];

      const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        requestedUrls.push(`${method} ${url}`);

        if (url.includes("/api/face-lists/list-1/faces/2") && method === "DELETE") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              list: {
                id: "list-1",
                name: "Family List",
                faceCount: 2,
                createdAt: "2026-11-05T08:00:00Z",
              },
            }),
          } as Response;
        }

        if (url.includes("/faces/") && method === "GET") {
          return {
            ok: true,
            status: 200,
            blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
          } as Response;
        }

        if (url.includes("/api/face-lists") && method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              lists: [
                {
                  id: "list-1",
                  name: "Family List",
                  faceCount: 3,
                  createdAt: "2026-11-05T08:00:00Z",
                },
              ],
            }),
          } as Response;
        }

        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      vi.stubGlobal("fetch", fetchSpy);

      render(
        <MemoryRouter>
          <SavedFaceListsPanel />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      // Open viewer directly at face #2
      const face2ThumbBtn = screen.getByRole("button", { name: "View face #2 from Family List" });
      fireEvent.click(face2ThumbBtn);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Delete face #2" })).toBeDefined();
      });

      // Clear requested URLs prior to deletion
      requestedUrls.length = 0;

      // Click delete face #2
      fireEvent.click(screen.getByRole("button", { name: "Delete face #2" }));
      expect(screen.getByText("Delete this face?")).toBeDefined();

      // Click "Delete face" in confirm dialog
      const confirmDeleteBtn = screen.getByRole("button", { name: "Delete face" });
      fireEvent.click(confirmDeleteBtn);

      // Verify DELETE API call was made
      await waitFor(() => {
        expect(requestedUrls.some((u) => u.startsWith("DELETE") && u.includes("/api/face-lists/list-1/faces/2"))).toBe(
          true,
        );
      });

      // Viewer requests the next photo at index 2 with fresh fetch
      await waitFor(() => {
        expect(requestedUrls.some((u) => u.startsWith("GET") && u.includes("/api/face-lists/list-1/faces/2"))).toBe(
          true,
        );
      });

      // Active count is now updated in viewer title (2 faces/files)
      expect(screen.getByRole("heading", { name: /Family List \(2 (?:file|face)s\)/i })).toBeDefined();
    });

    it("Esc on the confirm closes only the confirm", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";

          if (url.includes("/faces/") && method === "GET") {
            return {
              ok: true,
              status: 200,
              blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
            } as Response;
          }

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
                ],
              }),
            } as Response;
          }

          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      render(
        <MemoryRouter>
          <SavedFaceListsPanel />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      // Open viewer
      fireEvent.click(screen.getByRole("button", { name: /^view$/i }));

      // Click trash button
      const trashBtn = screen.getByRole("button", { name: "Delete face #1" });
      fireEvent.click(trashBtn);

      expect(screen.getByText("Delete this face?")).toBeDefined();

      // Press Escape on window
      fireEvent.keyDown(window, { key: "Escape" });

      // Confirm dialog closed
      expect(screen.queryByText("Delete this face?")).toBeNull();

      // Viewer remains open!
      expect(screen.getByRole("heading", { name: /Family List \(2 (?:file|face)s\)/i })).toBeDefined();
    });

    it("deleting the last face removes the card", async () => {
      let deleteCalled = false;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";

          if (url.includes("/api/face-lists/list-single/faces/1") && method === "DELETE") {
            deleteCalled = true;
            return {
              ok: true,
              status: 200,
              json: async () => ({ list: null }),
            } as Response;
          }

          if (url.includes("/faces/") && method === "GET") {
            return {
              ok: true,
              status: 200,
              blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
            } as Response;
          }

          if (url.includes("/api/face-lists") && method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                lists: [
                  {
                    id: "list-single",
                    name: "Solo List",
                    faceCount: 1,
                    createdAt: "2026-11-05T08:00:00Z",
                  },
                ],
              }),
            } as Response;
          }

          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      render(
        <MemoryRouter>
          <SavedFaceListsPanel />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Solo List")).toBeDefined();
      });

      // Open viewer
      fireEvent.click(screen.getByRole("button", { name: /^view$/i }));

      // Click trash button
      fireEvent.click(screen.getByRole("button", { name: "Delete face #1" }));

      // Confirm delete
      fireEvent.click(screen.getByRole("button", { name: "Delete face" }));

      await waitFor(() => {
        expect(deleteCalled).toBe(true);
      });

      // Viewer dialog closes and card is removed
      await waitFor(() => {
        expect(screen.queryByRole("article", { name: /Solo List/i })).toBeNull();
      });
      expect(screen.getByText("No allow lists")).toBeDefined();
    });

    it("the viewer opened from the picker has no trash button", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";

          if (url.includes("/faces/") && method === "GET") {
            return {
              ok: true,
              status: 200,
              blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
            } as Response;
          }

          if (url.includes("/api/face-lists") && method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                lists: [
                  {
                    id: "list-1",
                    name: "Picker List",
                    faceCount: 2,
                    createdAt: "2026-11-05T08:00:00Z",
                  },
                ],
              }),
            } as Response;
          }

          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      render(<WhitelistUploader files={[]} onChange={vi.fn()} showSavedSelector={true} showSaveAsList={false} />);

      // Open picker dialog
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add allow list/i })).toBeDefined();
      });
      fireEvent.click(screen.getByRole("button", { name: /add allow list/i }));

      // In picker dialog, view the list
      await waitFor(() => {
        expect(screen.getByText("Picker List")).toBeDefined();
      });
      fireEvent.click(screen.getByRole("button", { name: "View face #1 from Picker List" }));

      // Viewer is open
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Picker List \(2 (?:file|face)s\)/i })).toBeDefined();
      });

      // Trash button should NOT exist
      expect(screen.queryByRole("button", { name: /delete face #1/i })).toBeNull();
      expect(screen.queryByText("🗑")).toBeNull();
    });
  });

  describe("Task 55: Allow list card rename, trash, chosen row thumbnail viewer, and remove", () => {
    it("renaming a card calls the API with that list's id and the card shows the new name", async () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      const familyCard = screen.getByRole("article", { name: /Family List/i });
      const pencilBtn = within(familyCard).getByRole("button", { name: /rename/i });
      fireEvent.click(pencilBtn);

      const input = within(familyCard).getByDisplayValue("Family List");
      fireEvent.change(input, { target: { value: "My Family Album" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("My Family Album")).toBeDefined();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/face-lists/list-1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "My Family Album" }),
        }),
      );
    });

    it("a failed rename keeps the old name", async () => {
      const originalFetch = global.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";

          if (url.includes("/api/face-lists/") && method === "PATCH") {
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: "Invalid face list name" }),
            } as Response;
          }
          return originalFetch(input, init);
        }),
      );

      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("VIP Team")).toBeDefined();
      });

      const vipCard = screen.getByRole("article", { name: /VIP Team/i });
      const pencilBtn = within(vipCard).getByRole("button", { name: /rename/i });
      fireEvent.click(pencilBtn);

      const input = within(vipCard).getByDisplayValue("VIP Team");
      fireEvent.change(input, { target: { value: "Invalid Name" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(within(vipCard).getByRole("alert")).toBeDefined();
      });

      // The old name remains displayed
      expect(screen.getByText("VIP Team")).toBeDefined();
    });

    it("the card's trash asks first and confirming deletes that list", async () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Conference Speakers")).toBeDefined();
      });

      const confCard = screen.getByRole("article", { name: /Conference Speakers/i });
      // Trash button in the header
      const trashBtn = within(confCard).getByRole("button", { name: /delete/i });
      fireEvent.click(trashBtn);

      // Confirm dialog opens
      await waitFor(() => {
        expect(
          within(screen.getByRole("dialog")).getByRole("heading", { name: /delete this allow list\?/i }),
        ).toBeDefined();
      });

      // Confirm deletion
      const confirmBtn = within(screen.getByRole("dialog")).getByRole("button", { name: /delete allow list/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.queryByText("Conference Speakers")).toBeNull();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/face-lists/list-3"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("clicking a thumbnail in the chosen row opens the viewer on that face", async () => {
      render(<WhitelistUploader files={[]} onChange={vi.fn()} selectedFaceListIds={["list-1"]} />);

      // Wait for chosen list row to render
      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      // Click face #2 thumbnail button
      const thumbBtn = screen.getByRole("button", { name: "View face #2 from Family List" });
      fireEvent.click(thumbBtn);

      // Viewer opens with title containing Family List
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
        expect(screen.getByRole("heading", { name: /Family List/i })).toBeDefined();
      });
    });

    it("removing a chosen list removes it from the submitted ids", async () => {
      let currentIds: string[] = ["list-1", "list-2"];
      const onIdsChange = vi.fn((next: string[]) => {
        currentIds = next;
      });

      const { rerender } = render(
        <WhitelistUploader
          files={[]}
          onChange={vi.fn()}
          selectedFaceListIds={currentIds}
          onFaceListIdsChange={onIdsChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
        expect(screen.getByText("VIP Team")).toBeDefined();
      });

      // Click remove button on Family List chosen row
      const removeBtn = screen.getByRole("button", { name: /remove allow list family list/i });
      fireEvent.click(removeBtn);

      expect(onIdsChange).toHaveBeenCalledWith(["list-2"]);

      // Rerender with updated ids to verify DOM removal
      rerender(
        <WhitelistUploader
          files={[]}
          onChange={vi.fn()}
          selectedFaceListIds={currentIds}
          onFaceListIdsChange={onIdsChange}
        />,
      );

      expect(screen.queryByText("Family List")).toBeNull();
      expect(screen.getByText("VIP Team")).toBeDefined();
    });
  });

  describe("Task 57: Rename an allow list from its viewer", () => {
    it("renaming in the viewer calls the API with that list's id and both the dialog title and the card update", async () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      // Open viewer
      const familyCard = screen.getByRole("article", { name: /Family List/i });
      const viewBtn = within(familyCard).getByRole("button", { name: /^view$/i });
      fireEvent.click(viewBtn);

      // Dialog is open
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();

      // Click pencil rename button inside the dialog
      const renameBtn = within(dialog).getByRole("button", { name: /rename/i });
      fireEvent.click(renameBtn);

      // Input appears in dialog with current list name
      const input = within(dialog).getByDisplayValue("Family List");
      fireEvent.change(input, { target: { value: "Renamed Family Members" } });
      fireEvent.keyDown(input, { key: "Enter" });

      // Dialog title updates with new name and count
      await waitFor(() => {
        expect(within(dialog).getByText(/Renamed Family Members/i)).toBeDefined();
      });

      // API was called with list-1 and new name
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/face-lists/list-1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Renamed Family Members" }),
        }),
      );

      // Close viewer to verify overview card also updated
      const closeBtn = within(dialog).getByRole("button", { name: /^close$/i });
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.getByRole("article", { name: /Renamed Family Members/i })).toBeDefined();
      });
    });

    it("a failed rename keeps the old name", async () => {
      const originalFetch = global.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";

          if (url.includes("/api/face-lists/") && method === "PATCH") {
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: "Failed to rename" }),
            } as Response;
          }
          return originalFetch(input, init);
        }),
      );

      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("VIP Team")).toBeDefined();
      });

      const vipCard = screen.getByRole("article", { name: /VIP Team/i });
      fireEvent.click(within(vipCard).getByRole("button", { name: /^view$/i }));

      const dialog = screen.getByRole("dialog");
      const renameBtn = within(dialog).getByRole("button", { name: /rename/i });
      fireEvent.click(renameBtn);

      const input = within(dialog).getByDisplayValue("VIP Team");
      fireEvent.change(input, { target: { value: "Broken Name" } });
      fireEvent.keyDown(input, { key: "Enter" });

      // Error alert displayed
      await waitFor(() => {
        expect(within(dialog).getByRole("alert")).toBeDefined();
      });

      // Dialog title keeps the old name
      expect(within(dialog).getByText(/VIP Team/i)).toBeDefined();

      // Card also retains the old name
      expect(screen.getByRole("article", { name: /VIP Team/i })).toBeDefined();
    });

    it("Esc while editing leaves the viewer open, then a second Esc closes it", async () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      const familyCard = screen.getByRole("article", { name: /Family List/i });
      fireEvent.click(within(familyCard).getByRole("button", { name: /^view$/i }));

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();

      // Start editing
      fireEvent.click(within(dialog).getByRole("button", { name: /rename/i }));
      const input = within(dialog).getByDisplayValue("Family List");
      expect(input).toBeDefined();

      // Type some draft edits
      fireEvent.change(input, { target: { value: "Draft Unsaved Name" } });

      // First Esc cancels only rename editing
      fireEvent.keyDown(input, { key: "Escape" });

      // Edit input is gone, draft reverted
      expect(within(dialog).queryByDisplayValue("Draft Unsaved Name")).toBeNull();

      // Viewer dialog is STILL open
      expect(screen.getByRole("dialog")).toBeDefined();

      // Second Esc on the dialog or window closes the viewer
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("arrow keys while editing don't change the shown face", async () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      // Family List has 2 faces; view opens on face #1
      const familyCard = screen.getByRole("article", { name: /Family List/i });
      fireEvent.click(within(familyCard).getByRole("button", { name: /^view$/i }));
      const dialog = screen.getByRole("dialog");

      // Verify initially on face #1
      const thumb1 = within(dialog).getByRole("button", { name: "Thumbnail 1" });
      expect(thumb1.getAttribute("aria-current")).toBe("true");

      // Start editing name
      fireEvent.click(within(dialog).getByRole("button", { name: /rename/i }));
      const input = within(dialog).getByDisplayValue("Family List");

      // Press ArrowRight while editing in the input
      fireEvent.keyDown(input, { key: "ArrowRight" });

      // Active face must NOT change (still on face #1)
      expect(thumb1.getAttribute("aria-current")).toBe("true");

      // Press ArrowLeft while editing in the input
      fireEvent.keyDown(input, { key: "ArrowLeft" });
      expect(thumb1.getAttribute("aria-current")).toBe("true");

      // Cancel or finish editing
      fireEvent.keyDown(input, { key: "Escape" });

      // When NOT editing, ArrowRight switches to face #2
      fireEvent.keyDown(window, { key: "ArrowRight" });
      const thumb2 = within(dialog).getByRole("button", { name: "Thumbnail 2" });
      expect(thumb2.getAttribute("aria-current")).toBe("true");
    });

    it("the picker's viewer has no rename control and still has an accessible dialog name", async () => {
      render(<WhitelistUploader files={[]} onChange={vi.fn()} showSavedSelector={true} showSaveAsList={false} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add allow list/i })).toBeDefined();
      });
      fireEvent.click(screen.getByRole("button", { name: /add allow list/i }));

      await waitFor(() => {
        expect(screen.getByText("Family List")).toBeDefined();
      });

      // View face #1 from picker dialog
      fireEvent.click(screen.getByRole("button", { name: "View face #1 from Family List" }));

      // Find the open viewer dialog by accessible role and name
      const viewerDialog = screen.getByRole("dialog", { name: /Family List/i });
      expect(viewerDialog).toBeDefined();

      // No rename pencil button exists inside the picker's viewer
      expect(within(viewerDialog).queryByRole("button", { name: /rename/i })).toBeNull();
    });
  });

  describe("Task 61: Allow list file limits, save button, and counter limits", () => {
    it("more than 5 files: 'Save list' is disabled, an alert explains why, no request is sent, and the batch can still be created", async () => {
      const onSubmit = vi.fn().mockResolvedValue({ batch: { id: "new-batch-6-refs" }, failed: [] });
      let faceListPostCalled = false;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";
          if (url.includes("/api/face-lists") && method === "POST") {
            faceListPostCalled = true;
            return {
              ok: true,
              status: 201,
              json: async () => ({
                list: { id: "new-list", name: "List", faceCount: 6, createdAt: "2026-11-06T00:00:00Z" },
              }),
            } as Response;
          }
          if (url.includes("/api/face-lists") && method === "GET") {
            return { ok: true, status: 200, json: async () => ({ lists: [] }) } as Response;
          }
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      const { container } = render(
        <MemoryRouter>
          <BatchCreateForm busy={false} error="" onSubmit={onSubmit} />
        </MemoryRouter>,
      );

      // Add 1 image for the batch
      const dropzone = container.querySelectorAll("input[type='file']")[0] as HTMLInputElement;
      const img = makeFile("batch-input.jpg");
      fireEvent.change(dropzone, { target: { files: [img] } });

      // Add 6 references (allowed for batch, but exceeds allow list cap of 5)
      const whitelistInput = screen.getByLabelText(/references/i) as HTMLInputElement;
      const sixFiles = Array.from({ length: 6 }, (_, i) => makeFile(`ref-${i + 1}.jpg`));
      fireEvent.change(whitelistInput, { target: { files: sixFiles } });

      // Save list button should be disabled
      const saveListBtn = screen.getByRole("button", { name: /save list/i }) as HTMLButtonElement;
      expect(saveListBtn.disabled).toBe(true);

      // Alert explaining why
      expect(screen.getByText(/allow lists can hold at most 5 files/i)).toBeDefined();

      // Typing a name and attempting to click should not trigger any POST
      const nameInput = screen.getByPlaceholderText(/name this allow list/i);
      fireEvent.change(nameInput, { target: { value: "My 6 Faces" } });
      expect(saveListBtn.disabled).toBe(true);
      fireEvent.click(saveListBtn);
      expect(faceListPostCalled).toBe(false);

      // Batch can still be created with those 6 files
      const form = screen.getByRole("form", { name: /batch/i });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      const call = onSubmit.mock.calls[0];
      expect(call[0]).toEqual([img]);
      expect(call[1]).toHaveLength(6);
      expect(faceListPostCalled).toBe(false);
    });

    it("a failed save shows an alert banner", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";
          if (url.includes("/api/face-lists") && method === "POST") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal server error saving allow list" }),
              text: async () => JSON.stringify({ error: "Internal server error saving allow list" }),
            } as Response;
          }
          if (url.includes("/api/face-lists") && method === "GET") {
            return { ok: true, status: 200, json: async () => ({ lists: [] }) } as Response;
          }
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }),
      );

      const files = [makeFile("ref1.jpg"), makeFile("ref2.jpg")];
      render(<WhitelistUploader files={files} onChange={vi.fn()} showSaveAsList={true} />);

      const nameInput = screen.getByPlaceholderText(/name this allow list/i);
      fireEvent.change(nameInput, { target: { value: "Failed List" } });

      const saveListBtn = screen.getByRole("button", { name: /save list/i });
      fireEvent.click(saveListBtn);

      await waitFor(() => {
        expect(screen.getByText(/internal server error saving allow list/i)).toBeDefined();
      });
      const alertBanner = screen.getByText(/internal server error saving allow list/i).closest(".error-banner");
      expect(alertBanner).not.toBeNull();
    });

    it("the counter shows the limit that applies: 5 in the allow-list form, 20 on the batch page", () => {
      // 1. Batch page (showSavedSelector = true): limit is 20
      const sixFiles = Array.from({ length: 6 }, (_, i) => makeFile(`ref-${i + 1}.jpg`));
      const { unmount } = render(
        <WhitelistUploader files={sixFiles} onChange={vi.fn()} showSavedSelector={true} showSaveAsList={true} />,
      );
      expect(screen.getByText("6 / 20 files")).toBeDefined();
      unmount();

      // 2. Allow-list form (showSavedSelector = false): limit is 5
      const twoFiles = [makeFile("face1.jpg"), makeFile("face2.jpg")];
      render(
        <WhitelistUploader files={twoFiles} onChange={vi.fn()} showSavedSelector={false} showSaveAsList={false} />,
      );
      expect(screen.getByText("2 / 5 files")).toBeDefined();
    });
  });
});
