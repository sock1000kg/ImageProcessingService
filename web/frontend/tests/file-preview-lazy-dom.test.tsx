// @vitest-environment happy-dom
/**
 * Tests verifying lazy file preview thumbnail loading using IntersectionObserver.
 * Ensures memory stays bounded with 1000+ files by loading object URLs only near view,
 * revoking on scroll-out or unmount, and gracefully falling back when unsupported.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, act, screen } from "@testing-library/react";
import { FilePreviewList } from "../src/components/FilePreviewList";

type ObserverCallback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;

let observers: MockObserver[] = [];

class MockObserver implements IntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number>;
  callback: ObserverCallback;
  elements = new Set<Element>();

  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? "0px";
    this.thresholds = [];
    observers.push(this);
  }

  observe(element: Element): void {
    this.elements.add(element);
  }

  unobserve(element: Element): void {
    this.elements.delete(element);
  }

  disconnect(): void {
    this.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(target: Element, isIntersecting: boolean): void {
    this.callback(
      [
        {
          target,
          isIntersecting,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: Date.now(),
        } as unknown as IntersectionObserverEntry,
      ],
      this,
    );
  }
}

function setElementInView(element: Element, inView: boolean): void {
  act(() => {
    for (const obs of observers) {
      if (obs.elements.has(element)) {
        obs.trigger(element, inView);
      }
    }
  });
}

function getObservedElement(observerIndex = 0): Element {
  const observer = observers[observerIndex];
  if (!observer || observer.elements.size === 0) {
    throw new Error(`No observed element registered on observer at index ${observerIndex}`);
  }
  const first = observer.elements.values().next().value;
  if (!first) {
    throw new Error(`Observed element is undefined on observer at index ${observerIndex}`);
  }
  return first;
}

describe("Task 80: Lazy FilePreviewList thumbnails", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal("IntersectionObserver", MockObserver);

    vi.spyOn(URL, "createObjectURL").mockImplementation((file: Blob | MediaSource) => {
      const name = file instanceof File ? file.name : "blob";
      return `blob:${name}`;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not call createObjectURL or render img for 1000 off-screen files, while preserving all rows and remove actions", () => {
    const files = Array.from(
      { length: 1000 },
      (_, i) => new File(["mock-content"], `photo-${i}.jpg`, { type: "image/jpeg" }),
    );
    const onRemove = vi.fn();

    const { container } = render(<FilePreviewList files={files} onRemove={onRemove} />);

    // Memory protection: no URLs or img tags created while rows remain out of view
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelectorAll("img")).toHaveLength(0);

    // Structural integrity: all 1000 remove buttons and file names are still mounted
    const removeButtons = screen.getAllByRole("button", { name: /^Remove /i });
    expect(removeButtons).toHaveLength(1000);
    expect(screen.getByText("photo-0.jpg")).toBeDefined();
    expect(screen.getByText("photo-999.jpg")).toBeDefined();
  }, 15000);

  it("loads an image thumbnail and invokes createObjectURL exactly once when a row enters view", () => {
    const file = new File(["test-image"], "vacation.png", { type: "image/png" });
    const { container } = render(<FilePreviewList files={[file]} onRemove={vi.fn()} />);

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelectorAll("img")).toHaveLength(0);

    expect(observers).toHaveLength(1);
    expect(observers[0]?.rootMargin).toBe("200px");
    expect(observers[0]?.root).not.toBeNull();

    const target = getObservedElement(0);
    setElementInView(target, true);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("src")).toBe("blob:vacation.png");
    expect(images[0]?.getAttribute("alt")).toBe("");
    expect(images[0]?.getAttribute("decoding")).toBe("async");
  });

  it("revokes the object URL and unmounts the img element when a row leaves the viewport", () => {
    const file = new File(["test-image"], "sunset.jpg", { type: "image/jpeg" });
    const { container } = render(<FilePreviewList files={[file]} onRemove={vi.fn()} />);

    const target = getObservedElement(0);
    setElementInView(target, true);

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    // Trigger leaving view
    setElementInView(target, false);

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:sunset.jpg");
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("revokes held object URLs when unmounting while visible", () => {
    const file = new File(["test-image"], "mount.jpg", { type: "image/jpeg" });
    const { unmount } = render(<FilePreviewList files={[file]} onRemove={vi.fn()} />);

    const target = getObservedElement(0);
    setElementInView(target, true);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mount.jpg");
  });

  it("renders thumbnails immediately when IntersectionObserver is unsupported in the runtime", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    const files = [
      new File(["data1"], "fallback-1.jpg", { type: "image/jpeg" }),
      new File(["data2"], "fallback-2.png", { type: "image/png" }),
    ];

    const { container } = render(<FilePreviewList files={files} onRemove={vi.fn()} />);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0]?.getAttribute("src")).toBe("blob:fallback-1.jpg");
    expect(images[1]?.getAttribute("src")).toBe("blob:fallback-2.png");
  });
});
