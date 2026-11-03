// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { setAccessToken } from "../src/auth";
import { useJobOriginalUrl } from "../src/hooks/useJobOriginalUrl";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("useJobOriginalUrl", () => {
  it("fetches the original with the Bearer token and exposes a blob URL, revoked on unmount", async () => {
    setAccessToken("token-1");
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["img"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const revoke = vi.spyOn(URL, "revokeObjectURL");

    const { result, unmount } = renderHook(() => useJobOriginalUrl("job-1"));
    await waitFor(() => expect(result.current).toMatch(/^blob:/));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/jobs/job-1/original");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-1");

    const objectUrl = result.current;
    unmount();
    expect(revoke).toHaveBeenCalledWith(objectUrl);
  });

  it("refreshes an expired token once and retries", async () => {
    setAccessToken("expired");
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/refresh") {
        return Promise.resolve(Response.json({ accessToken: "fresh" }));
      }
      return Promise.resolve(
        fetchMock.mock.calls.length === 1
          ? Response.json({ error: { message: "expired" } }, { status: 401 })
          : new Response(new Blob(["img"]), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobOriginalUrl("job-2"));
    await waitFor(() => expect(result.current).toMatch(/^blob:/));
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/jobs/job-2/original",
      "/api/auth/refresh",
      "/api/jobs/job-2/original",
    ]);
  });
});
