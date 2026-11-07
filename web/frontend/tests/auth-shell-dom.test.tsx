// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

describe("Auth Shell and Layout Routing DOM Tests (Task 67)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jobs: {} }),
      } as Response),
    );
    mockSignIn.mockClear();
    mockSignUp.mockClear();
    mockSignOut.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the sign-in form and single h1 without navigation landmark when logged out on /login", () => {
    setAuthState("unauthenticated");
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("form")).toBeDefined();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toMatch(/sign in/i);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders the registration form and single h1 without navigation landmark when logged out on /register", () => {
    setAuthState("unauthenticated");
    render(
      <MemoryRouter initialEntries={["/register"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("form")).toBeDefined();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toMatch(/register/i);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("redirects logged-out user from / to the sign-in form", () => {
    setAuthState("unauthenticated");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("form")).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: /sign in/i })).toBeDefined();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("redirects logged-out user from an unknown URL to the sign-in form", () => {
    setAuthState("unauthenticated");
    render(
      <MemoryRouter initialEntries={["/unknown-path-does-not-exist"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("form")).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: /sign in/i })).toBeDefined();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("redirects logged-in user from /login to workspace with navigation present", () => {
    setAuthState("authenticated");
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation")).toBeDefined();
    expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
  });

  it("renders loading state with no form and no navigation landmark", () => {
    setAuthState("loading");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText(/checking session/i)).toBeDefined();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("calls signOut when clicking the sign out action while logged in", () => {
    setAuthState("authenticated");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const signOutButton = screen.getByRole("button", { name: /sign out/i });
    expect(signOutButton).toBeDefined();
    fireEvent.click(signOutButton);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
