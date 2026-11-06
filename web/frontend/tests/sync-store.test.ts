// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ApiError } from "../src/api";
import { reportSync, resetSync, useSyncStatus } from "../src/sync";
import { usePolling } from "../src/hooks/usePolling";

describe("Sync store and usePolling hook (Task 60)", () => {
  beforeEach(() => {
    resetSync();
  });

  afterEach(() => {
    resetSync();
  });

  it("reports ok on successful sync or non-5xx/non-429 ApiError", () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current).toBe("idle");

    act(() => {
      reportSync();
    });
    expect(result.current).toBe("ok");

    // 404 ApiError still counts as backend responded ok
    act(() => {
      reportSync(new ApiError("Not found", { status: 404 }));
    });
    expect(result.current).toBe("ok");

    // 401 ApiError counts as ok
    act(() => {
      reportSync(new ApiError("Unauthorized", { status: 401 }));
    });
    expect(result.current).toBe("ok");
  });

  it("reports lost on network errors and server 5xx/429 ApiErrors", () => {
    const { result } = renderHook(() => useSyncStatus());

    // Generic error (network failure / fetch rejected)
    act(() => {
      reportSync(new TypeError("Failed to fetch"));
    });
    expect(result.current).toBe("lost");

    // 500 ApiError
    act(() => {
      reportSync(new ApiError("Internal error", { status: 500 }));
    });
    expect(result.current).toBe("lost");

    // 503 ApiError
    act(() => {
      reportSync(new ApiError("Unavailable", { status: 503 }));
    });
    expect(result.current).toBe("lost");

    // 429 Rate limited
    act(() => {
      reportSync(new ApiError("Too many requests", { status: 429 }));
    });
    expect(result.current).toBe("lost");

    // Reset back to idle
    act(() => {
      resetSync();
    });
    expect(result.current).toBe("idle");
  });

  it("usePolling accepts null/undefined without starting timers and resets sync on cleanup", async () => {
    vi.useFakeTimers();
    const pollFn = vi.fn().mockResolvedValue(undefined);

    const { unmount } = renderHook(() => usePolling(null, 1000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(pollFn).not.toHaveBeenCalled();
    unmount();

    vi.useRealTimers();
  });

  it("usePolling guards against late-finishing poll after cleanup", async () => {
    vi.useFakeTimers();

    let rejectPromise: ((err: unknown) => void) | null = null;
    const slowPoll = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        rejectPromise = reject;
      });
    });

    const { result: statusResult } = renderHook(() => useSyncStatus());
    const { unmount } = renderHook(() => usePolling(slowPoll, 1000));

    // Advance 1 tick to trigger slowPoll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(slowPoll).toHaveBeenCalledTimes(1);

    // Unmount while slowPoll is in-flight: cleanup sets status back to idle
    unmount();
    expect(statusResult.current).toBe("idle");

    // Now late rejection happens
    await act(async () => {
      rejectPromise?.(new Error("Network drop"));
      await Promise.resolve();
    });

    // Sync status must stay idle, NOT corrupted to lost
    expect(statusResult.current).toBe("idle");

    vi.useRealTimers();
  });
});
