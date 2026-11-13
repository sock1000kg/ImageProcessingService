// @vitest-environment happy-dom
/**
 * Tests for the browser redaction preview drawing (redaction-draw.ts): blackout matches the Engine's pure black,
 * and blur still draws on browsers that ignore CanvasRenderingContext2D.filter (Safari on iPhone) without ever
 * reading pixels back, which would throw on the editor's cross-origin result image.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeContext = {
  canvas: HTMLCanvasElement;
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  save: () => void;
  restore: () => void;
  translate: () => void;
  scale: () => void;
  fillStyle: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  filter?: string;
};

let contexts: Map<HTMLCanvasElement, FakeContext>;

/** Canvases whose context records every call; `filterSupported: false` leaves `filter` undefined like Safari. */
function installFakeCanvas(filterSupported: boolean) {
  contexts = new Map();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    if (!contexts.has(this)) {
      const context: FakeContext = {
        canvas: this,
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        getImageData: vi.fn(() => {
          throw new Error("tainted canvas: pixels cannot be read");
        }),
        save: () => undefined,
        restore: () => undefined,
        translate: () => undefined,
        scale: () => undefined,
        fillStyle: "",
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "low",
      };
      if (filterSupported) context.filter = "none";
      contexts.set(this, context);
    }
    return contexts.get(this) as unknown as CanvasRenderingContext2D;
  } as never);
}

function mainCanvas(width = 400, height = 300) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadDrawRedaction() {
  vi.resetModules(); // the module remembers whether the browser supports canvas filters
  return (await import("../src/redaction-draw")).drawRedaction;
}

describe("drawRedaction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blackout paints pure black over the padded box, like the Engine", async () => {
    installFakeCanvas(true);
    const drawRedaction = await loadDrawRedaction();
    const canvas = mainCanvas(200, 100);
    const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

    drawRedaction(context, { x: 20, y: 20, width: 50, height: 30 }, "blackout", 15, 0.1);

    const fake = contexts.get(canvas) as FakeContext;
    expect(fake.fillStyle).toBe("#000000");
    expect(fake.fillRect).toHaveBeenCalledWith(15, 17, 60, 36);
  });

  it("blur uses the canvas filter where the browser supports it", async () => {
    installFakeCanvas(true);
    const drawRedaction = await loadDrawRedaction();
    const canvas = mainCanvas();
    const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

    drawRedaction(context, { x: 100, y: 100, width: 80, height: 60 }, "blur", 15, 0.1);

    const filters = [...contexts.values()].map((c) => c.filter).filter((value) => value !== "none");
    expect(filters.some((value) => /^blur\(.+px\)$/.test(value ?? ""))).toBe(true);
    expect((contexts.get(canvas) as FakeContext).drawImage).toHaveBeenCalledTimes(1);
  });

  it("blur still draws, without filter or reading pixels, where the browser ignores canvas filters", async () => {
    installFakeCanvas(false);
    const drawRedaction = await loadDrawRedaction();
    const canvas = mainCanvas();
    const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

    expect(() => drawRedaction(context, { x: 100, y: 100, width: 80, height: 60 }, "blur", 15, 0.1)).not.toThrow();

    const fake = contexts.get(canvas) as FakeContext;
    // The blurred crop is drawn back over the padded box: 96 x 72 at (92, 94), the 80 x 60 box plus 10% each side.
    expect(fake.drawImage).toHaveBeenCalledTimes(1);
    expect(fake.drawImage.mock.calls[0].slice(5)).toEqual([92, 94, 96, 72]);
    expect([...contexts.values()].some((c) => c.filter !== undefined)).toBe(false);
    expect([...contexts.values()].every((c) => c.getImageData.mock.calls.length === 0)).toBe(true);
    // It shrank and enlarged the crop with smoothing on, so the result is a real blur of the crop.
    const resamples = [...contexts.values()].filter((c) => c.canvas !== canvas && c.imageSmoothingQuality === "high");
    expect(resamples.length).toBeGreaterThanOrEqual(2);
  });
});
