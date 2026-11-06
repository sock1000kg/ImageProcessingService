/**
 * Polling lifecycle hook managing periodic ticks, cleanup, and sync status telemetry.
 */
import { useEffect, useRef } from "react";
import { reportSync, resetSync } from "../sync";

/**
 * Periodically invokes an asynchronous polling function and reports connection outcomes.
 *
 * Why: Consolidates setInterval ownership into a single place. Cleans up timers on unmount,
 * guards against late-resolving promises corrupting sync status after teardown,
 * and resets connection state back to idle when no poller is active.
 *
 * @param poll Polling callback executed on each interval tick, or null/undefined when polling is inactive
 * @param intervalMs Polling cadence in milliseconds
 */
export function usePolling(poll: (() => Promise<unknown> | unknown) | null | undefined, intervalMs: number): void {
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    if (!poll) {
      resetSync();
      return;
    }

    let active = true;

    const tick = async () => {
      try {
        await pollRef.current?.();
        if (active) {
          reportSync();
        }
      } catch (err) {
        if (active) {
          reportSync(err);
        }
      }
    };

    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      active = false;
      window.clearInterval(timer);
      resetSync();
    };
  }, [poll, intervalMs]);
}
