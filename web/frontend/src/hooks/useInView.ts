/**
 * Hook detecting element visibility relative to a scrollable container.
 * Uses IntersectionObserver to track entering and exiting viewport bounds,
 * falling back to inView = true when IntersectionObserver is unavailable.
 */
import { useEffect, useRef, useState } from "react";

/**
 * Result returned by the useInView hook.
 */
export interface UseInViewResult<T extends HTMLElement = HTMLElement> {
  /** Ref attached to the DOM element whose viewport visibility is tracked. */
  ref: React.RefObject<T>;
  /** Whether the element is currently visible or near the scroll viewport. */
  inView: boolean;
}

/**
 * Custom hook tracking whether a DOM node is in or near the visible scroll area.
 * The observer uses the closest `.scroll-list` ancestor as the scroll container root.
 */
export function useInView<T extends HTMLElement = HTMLElement>(): UseInViewResult<T> {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState<boolean>(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const element = ref.current;
    if (!element) {
      return;
    }

    // Why: with a null root, rootMargin doesn't extend past a scrolling ancestor, so rows wouldn't load before they appear.
    const root = element.closest(".scroll-list");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === element) {
            setInView(entry.isIntersecting);
          }
        }
      },
      {
        root,
        rootMargin: "200px",
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, inView };
}
