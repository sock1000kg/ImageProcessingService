// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "../src/components/ui/Dialog";
import { FaceListViewer } from "../src/components/FaceListViewer";
import { FaceListItem } from "../src/types";

describe("Dialog page scroll lock", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.unstubAllGlobals();
  });

  it("applies overflow: hidden to document.body when dialog opens", () => {
    expect(document.body.style.overflow).toBe("");

    const { rerender } = render(
      <Dialog open={false} title="Test Dialog" onClose={() => {}}>
        <div>Dialog Body</div>
      </Dialog>,
    );

    expect(document.body.style.overflow).toBe("");

    rerender(
      <Dialog open={true} title="Test Dialog" onClose={() => {}}>
        <div>Dialog Body</div>
      </Dialog>,
    );

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body overflow when dialog closes (open changes to false)", () => {
    const { rerender } = render(
      <Dialog open={true} title="Test Dialog" onClose={() => {}}>
        <div>Dialog Body</div>
      </Dialog>,
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Dialog open={false} title="Test Dialog" onClose={() => {}}>
        <div>Dialog Body</div>
      </Dialog>,
    );

    expect(document.body.style.overflow).toBe("");
  });

  it("restores body overflow when dialog unmounts while open", () => {
    const { unmount } = render(
      <Dialog open={true} title="Test Dialog" onClose={() => {}}>
        <div>Dialog Body</div>
      </Dialog>,
    );

    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("");
  });

  it("restores previous non-empty body overflow style after closing", () => {
    document.body.style.overflow = "scroll";

    const { rerender } = render(
      <Dialog open={true} title="Test Dialog" onClose={() => {}}>
        <div>Dialog Body</div>
      </Dialog>,
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Dialog open={false} title="Test Dialog" onClose={() => {}}>
        <div>Dialog Body</div>
      </Dialog>,
    );

    expect(document.body.style.overflow).toBe("scroll");
  });

  it("keeps scroll lock active when a nested dialog closes while parent remains open", () => {
    // Parent dialog is open
    const { rerender } = render(
      <>
        <Dialog open={true} title="Parent Dialog" onClose={() => {}}>
          <div>Parent Content</div>
        </Dialog>
        <Dialog open={false} title="Child Dialog" onClose={() => {}}>
          <div>Child Content</div>
        </Dialog>
      </>,
    );

    expect(document.body.style.overflow).toBe("hidden");

    // Child opens
    rerender(
      <>
        <Dialog open={true} title="Parent Dialog" onClose={() => {}}>
          <div>Parent Content</div>
        </Dialog>
        <Dialog open={true} title="Child Dialog" onClose={() => {}}>
          <div>Child Content</div>
        </Dialog>
      </>,
    );

    expect(document.body.style.overflow).toBe("hidden");

    // Child closes while parent is still open
    rerender(
      <>
        <Dialog open={true} title="Parent Dialog" onClose={() => {}}>
          <div>Parent Content</div>
        </Dialog>
        <Dialog open={false} title="Child Dialog" onClose={() => {}}>
          <div>Child Content</div>
        </Dialog>
      </>,
    );

    // Page overflow must remain hidden because parent is still open!
    expect(document.body.style.overflow).toBe("hidden");

    // Parent closes
    rerender(
      <>
        <Dialog open={false} title="Parent Dialog" onClose={() => {}}>
          <div>Parent Content</div>
        </Dialog>
        <Dialog open={false} title="Child Dialog" onClose={() => {}}>
          <div>Child Content</div>
        </Dialog>
      </>,
    );

    // Now page overflow is restored
    expect(document.body.style.overflow).toBe("");
  });

  it("integrates with FaceListViewer: scroll stays locked while nested confirm dialog opens and closes", () => {
    const mockList: FaceListItem = {
      id: "sample-list-1",
      name: "VIP Members",
      faceCount: 2,
      faceNames: ["Alice", "Bob"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const onDeleteFace = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    // Render FaceListViewer
    const { unmount } = render(
      <FaceListViewer list={mockList} open={true} onClose={onClose} onDeleteFace={onDeleteFace} />,
    );

    // Initial viewer open -> scroll locked
    expect(document.body.style.overflow).toBe("hidden");

    // Click trash icon to trigger nested DeleteBatchDialog
    const deleteBtn = screen.getAllByRole("button", { name: /delete/i })[0];
    fireEvent.click(deleteBtn);

    // Confirm dialog is now open alongside viewer
    expect(screen.getByRole("dialog", { name: /delete/i })).toBeDefined();
    expect(document.body.style.overflow).toBe("hidden");

    // Click cancel in confirm dialog -> confirm dialog closes, viewer remains open
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // Confirm dialog is gone, viewer is still open -> scroll lock must STILL be hidden
    expect(screen.queryByRole("dialog", { name: /delete/i })).toBeNull();
    expect(screen.queryAllByRole("dialog")).toHaveLength(1);
    expect(document.body.style.overflow).toBe("hidden");

    // Unmount viewer (simulating full close) -> scroll lock released
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
