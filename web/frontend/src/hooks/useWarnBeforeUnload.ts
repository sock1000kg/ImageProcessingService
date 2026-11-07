import { useEffect } from "react";

/**
 * Attaches a `beforeunload` listener to warn users before closing the tab or navigating away
 * while an operation (such as file uploading) is in progress.
 *
 * @param active - Whether the warning listener should be active.
 */
export function useWarnBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    // The upload loop runs in the page, so closing the tab stops it for good.
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [active]);
}
