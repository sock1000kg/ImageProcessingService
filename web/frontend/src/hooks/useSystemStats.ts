/**
 * Background hook for fetching and polling global system job statistics.
 *
 * What it polls: Calls `getSystemStats()` to receive system-wide counts of jobs by status.
 * Polling cadence: Executes immediately upon mounting, then polls periodically every 5 seconds.
 * When it stops: Polling terminates when the mounting component unmounts via `clearInterval`.
 * How errors surface: Failures are caught and silently ignored because global stats are non-blocking
 * and must not disrupt user workflows or main view interactions.
 */
import { useEffect, useState } from "react";
import { getSystemStats } from "../api";

/**
 * Polls aggregate system processing metrics across all jobs every 5 seconds.
 *
 * @returns State object exposing system job statistics and a manual refresh method
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
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return { stats, refreshStats };
}
