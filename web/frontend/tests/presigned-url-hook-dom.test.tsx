// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPresignedUrlCache, usePresignedUrl } from "../src/hooks/usePresignedUrl";
import * as api from "../src/api";

describe("usePresignedUrl", () => {
  beforeEach(() => {
    clearPresignedUrlCache();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("fetches a new URL when the tab becomes visible after the old one expired", async () => {
    let call = 0;
    const requestSpy = vi.spyOn(api, "request").mockImplementation(async () => {
      call += 1;
      return { url: `https://blob.test/img-${call}`, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    });
    const { result } = renderHook(() => usePresignedUrl("/api/jobs/1/result-url"));
    await waitFor(() => expect(result.current.url).toBe("https://blob.test/img-1"));

    // The URL expires while the tab sleeps; its refresh timer never ran.
    const later = Date.now() + 10 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(result.current.url).toBe("https://blob.test/img-2"));
    expect(requestSpy).toHaveBeenCalledTimes(2);
  });

  it("still retries an image error after an earlier URL had already been retried once", async () => {
    let call = 0;
    vi.spyOn(api, "request").mockImplementation(async () => {
      call += 1;
      return { url: `https://blob.test/img-${call}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
    });
    const { result } = renderHook(() => usePresignedUrl("/api/jobs/2/result-url"));
    await waitFor(() => expect(result.current.url).toBe("https://blob.test/img-1"));

    const fail = (src: string) => {
      const img = document.createElement("img");
      img.src = src;
      document.body.appendChild(img);
      act(() => {
        img.dispatchEvent(new Event("error"));
      });
      img.remove();
    };

    fail("https://blob.test/img-1");
    await waitFor(() => expect(result.current.url).toBe("https://blob.test/img-2"));

    // The retried URL later expires and is replaced by a normal refresh; a failure on that one must be retried too.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 3_600_000);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(result.current.url).toBe("https://blob.test/img-3"));
    fail("https://blob.test/img-3");
    await waitFor(() => expect(result.current.url).toBe("https://blob.test/img-4"));
  });
});
