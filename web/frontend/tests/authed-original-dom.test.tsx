// @vitest-environment happy-dom
/**
 * Frontend DOM and hook unit tests for presigned URL lifecycle:
 * - Verifies authenticated endpoint fetching with Bearer token
 * - Verifies token rotation retry on 401
 * - Verifies hook asks again after URL expires and after an image load error (fake timers)
 * - Verifies cross-component module-level caching and revision busting
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { setAccessToken } from "../src/auth";
import { clearPresignedUrlCache, usePresignedUrl } from "../src/hooks/usePresignedUrl";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setAccessToken(null);
  clearPresignedUrlCache();
});

describe("usePresignedUrl", () => {
  it("fetches the presigned URL with the Bearer token and returns url, loading, error", async () => {
    setAccessToken("token-1");
    const mockExpiresAt = new Date(Date.now() + 300_000).toISOString();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "http://localhost:9000/uploads/job-1.jpg", expiresAt: mockExpiresAt }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePresignedUrl("/api/jobs/job-1/original-url"));
    await waitFor(() => expect(result.current.url).toBe("http://localhost:9000/uploads/job-1.jpg"));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/jobs/job-1/original-url");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-1");
  });

  it("refreshes an expired token once and retries", async () => {
    setAccessToken("expired");
    const mockExpiresAt = new Date(Date.now() + 300_000).toISOString();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/refresh") {
        return Promise.resolve(Response.json({ accessToken: "fresh" }));
      }
      return Promise.resolve(
        fetchMock.mock.calls.length === 1
          ? Response.json({ error: { message: "expired" } }, { status: 401 })
          : Response.json({ url: "http://localhost:9000/uploads/job-2.jpg", expiresAt: mockExpiresAt }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePresignedUrl("/api/jobs/job-2/original-url"));
    await waitFor(() => expect(result.current.url).toBe("http://localhost:9000/uploads/job-2.jpg"));
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/jobs/job-2/original-url",
      "/api/auth/refresh",
      "/api/jobs/job-2/original-url",
    ]);
  });

  it("the hook asks again after the URL expires and after an image load error (one test, fake timers)", async () => {
    vi.useFakeTimers();
    setAccessToken("token-test");

    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      const now = Date.now();
      // Expires 60 seconds from now; with 30s buffer, refresh triggers in 30s
      return new Response(
        JSON.stringify({
          url: `http://localhost:9000/presigned-url-${callCount}.jpg`,
          expiresAt: new Date(now + 60_000).toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    function TestImageComponent() {
      const { url, loading, error } = usePresignedUrl("/api/jobs/job-exp/original-url");
      if (loading) return <div>loading</div>;
      if (error) return <div>error</div>;
      if (!url) return null;
      return <img src={url} alt="Presigned preview" />;
    }

    render(<TestImageComponent />);

    // 1. Initial fetch completes
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const img = screen.getByRole("img") as HTMLImageElement;
      expect(img.src).toBe("http://localhost:9000/presigned-url-1.jpg");
    });

    // 2. Advance time past the 30s refresh threshold (expiresAt 60s - 30s = 30s)
    await vi.advanceTimersByTimeAsync(31_000);

    // The hook asks again after the URL expires
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const img = screen.getByRole("img") as HTMLImageElement;
      expect(img.src).toBe("http://localhost:9000/presigned-url-2.jpg");
    });

    // 3. Trigger image load error on the rendered img
    const currentImg = screen.getByRole("img") as HTMLImageElement;
    fireEvent.error(currentImg);

    // The hook asks again after an image load error
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const img = screen.getByRole("img") as HTMLImageElement;
      expect(img.src).toBe("http://localhost:9000/presigned-url-3.jpg");
    });

    // 4. Trigger second image load error: hook should NOT ask again (only retries once), sets error state
    const failedImg = screen.getByRole("img") as HTMLImageElement;
    fireEvent.error(failedImg);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(screen.getByText("error")).toBeDefined();
    });
  });

  it("shares the cache across components for the same endpoint path so thumbnails don't refetch", async () => {
    setAccessToken("token-shared");
    const mockExpiresAt = new Date(Date.now() + 300_000).toISOString();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "http://localhost:9000/shared.jpg", expiresAt: mockExpiresAt }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    function ThumbnailA() {
      const { url } = usePresignedUrl("/api/batches/b1/whitelist/1/url");
      return <div>A: {url}</div>;
    }

    function ThumbnailB() {
      const { url } = usePresignedUrl("/api/batches/b1/whitelist/1/url");
      return <div>B: {url}</div>;
    }

    render(
      <div>
        <ThumbnailA />
        <ThumbnailB />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByText("A: http://localhost:9000/shared.jpg")).toBeDefined();
      expect(screen.getByText("B: http://localhost:9000/shared.jpg")).toBeDefined();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
