/**
 * Background hook for fetching and polling the signed-in user's job statistics.
 *
 * What it polls: Calls `getSystemStats()`, which counts jobs by status in the user's own batches only (the backend
 * filters by account; the "system" in the route name is historical).
 * Polling cadence: Executes immediately upon mounting, then polls periodically every 5 seconds.
 * When it stops: Polling terminates when the mounting component unmounts via `clearInterval`.
 * How errors surface: Failures are caught and silently ignored because the stats are non-blocking
 * and must not disrupt user workflows or main view interactions.
 */
import { useEffect, useState } from "react";
import { getSystemStats } from "../api";
import { STATS_SYNC_MS } from "../sync";

/**
 * Polls the user's job counts by status every 5 seconds.
 *
 * @returns State object exposing the user's job statistics and a manual refresh method
 */
export function useSystemStats() {
  const [stats, setStats] = useState<Record<string, number>>({});

  const refreshStats = async () => {
    try {
      const response = await getSystemStats();
      setStats(response.jobs ?? {});
    } catch {
      // Non-blocking background telemetry: preserve existing stats on transient failures
    }
  };

  useEffect(() => {
    void refreshStats();
    const timer = window.setInterval(() => {
      void refreshStats();
    }, STATS_SYNC_MS);
    return () => window.clearInterval(timer);
  }, []);

  return { stats, refreshStats };
}
