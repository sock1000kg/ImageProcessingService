/**
 * Background hook for fetching and polling the signed-in user's job statistics.
 *
 * What it polls: Calls `getSystemStats()`, which counts jobs by status in the user's own batches only (the backend
 * filters by account; the "system" in the route name is historical).
 * Polling cadence: Executes initial fetch upon mounting, then polls periodically every 5 seconds via `usePolling`.
 * When it stops: Polling terminates when the mounting component unmounts via `usePolling`.
 * How errors surface: Polling errors reach `usePolling` to update the global connection status while preserving
 * existing stats on screen.
 */
import { useCallback, useEffect, useState } from "react";
import { getSystemStats } from "../api";
import { STATS_SYNC_MS } from "../sync";
import { usePolling } from "./usePolling";

/**
 * Polls the user's job counts by status every 5 seconds.
 *
 * @returns State object exposing the user's job statistics
 */
export function useSystemStats() {
  const [stats, setStats] = useState<Record<string, number>>({});

  const pollStats = useCallback(async () => {
    const response = await getSystemStats();
    setStats(response.jobs ?? {});
  }, []);

  usePolling(pollStats, STATS_SYNC_MS);

  useEffect(() => {
    // Initial load on mount: failures are ignored here because the next poll reports connection state
    void pollStats().catch(() => {});
  }, [pollStats]);

  return { stats };
}
