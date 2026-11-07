// @vitest-environment happy-dom
/**
 * Behaviour tests for theme switching and the ThemeToggle component (DESIGN.md §5, Task 68).
 * Tests DOM synchronization, error resilience, OS color-scheme preference tracking,
 * and visibility across authentication and workspace shells.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeToggle } from "../src/components/ui/ThemeToggle";
import { App } from "../src/App";
import { useAuth } from "../src/context/AuthContext";

vi.mock("../src/context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(),
}));

const mockSignIn = vi.fn().mockResolvedValue(undefined);
const mockSignUp = vi.fn().mockResolvedValue(undefined);
const mockSignOut = vi.fn().mockResolvedValue(undefined);

function setAuthState(status: "loading" | "authenticated" | "unauthenticated", email = "test@example.com") {
  vi.mocked(useAuth).mockReturnValue({
    status,
    user: status === "authenticated" ? { id: "user-123", email } : null,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signOut: mockSignOut,
  });
}

describe("Theme and ThemeToggle DOM Tests (Task 68)", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jobs: {} }),
      } as Response),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    window.matchMedia = originalMatchMedia;
  });

  it("clicking the toggle flips dataset.theme, saves the choice, and its accessible name flips", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(button).toBeDefined();

    // Click to switch to dark mode
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeDefined();

    // Click again to switch back to light mode
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeDefined();
  });

  it("with matchMedia absent and with localStorage throwing, the toggle renders and still flips the theme", () => {
    // Simulate environments without matchMedia
    // @ts-expect-error simulating missing matchMedia in restricted or older runtimes
    window.matchMedia = undefined;

    // Simulate storage access failure (e.g. private browsing or disabled cookies)
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage access blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage quota exceeded");
    });

    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /switch to (dark|light) mode/i });
    expect(button).toBeDefined();

    // Flipping should safely update DOM dataset even when localStorage fails
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeDefined();

    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeDefined();
  });

  it("follows OS color-scheme preference changes before user picks and ignores them after", () => {
    let mediaCallback: ((e: MediaQueryListEvent) => void) | null = null;
    const listeners: Array<(e: MediaQueryListEvent) => void> = [];

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
        if (event === "change") {
          mediaCallback = cb;
          listeners.push(cb);
        }
      }),
      removeEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
        const index = listeners.indexOf(cb);
        if (index >= 0) listeners.splice(index, 1);
        if (mediaCallback === cb) mediaCallback = null;
      }),
      addListener: vi.fn((cb: (e: MediaQueryListEvent) => void) => {
        mediaCallback = cb;
      }),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<ThemeToggle />);

    // Before user interacts, OS dark mode change should be followed
    expect(mediaCallback).not.toBeNull();
    act(() => {
      mediaCallback!({ matches: true } as MediaQueryListEvent);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeDefined();

    // User explicitly switches to light mode
    const button = screen.getByRole("button", { name: /switch to light mode/i });
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");

    // Subsequent OS change should be ignored because the user has picked
    if (mediaCallback) {
      act(() => {
        mediaCallback({ matches: true } as MediaQueryListEvent);
      });
    }
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeDefined();
  });

  it("the toggle is reachable on the sign-in page and in the workspace", () => {
    // 1. Reachable on sign-in page
    setAuthState("unauthenticated");
    const { unmount } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );

    const authToggle = screen.getByRole("button", { name: /switch to (dark|light) mode/i });
    expect(authToggle).toBeDefined();
    unmount();

    // 2. Reachable in workspace layout
    setAuthState("authenticated");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const workspaceToggle = screen.getByRole("button", { name: /switch to (dark|light) mode/i });
    expect(workspaceToggle).toBeDefined();
  });
});
