// @vitest-environment happy-dom
/**
 * Accessibility and Phosphor icon integration DOM tests (Task 69).
 * Verifies accessible names of icon-backed navigation links, skip link behavior,
 * sign out tooltip email binding, and icon-only button naming across layouts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/App";
import { WorkspaceLayout } from "../src/components/AppLayouts";
import { Banner } from "../src/components/ui/Banner";
import { useAuth } from "../src/context/AuthContext";

vi.mock("../src/context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(),
}));

const mockSignIn = vi.fn().mockResolvedValue(undefined);
const mockSignUp = vi.fn().mockResolvedValue(undefined);
const mockSignOut = vi.fn().mockResolvedValue(undefined);

function setAuthState(status: "loading" | "authenticated" | "unauthenticated", email = "operator@redactfunnel.test") {
  vi.mocked(useAuth).mockReturnValue({
    status,
    user: status === "authenticated" ? { id: "user-42", email } : null,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signOut: mockSignOut,
  });
}

describe("Icons, Focus and Accessibility DOM Tests (Task 69)", () => {
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

  it("nav links have accessible names matching their exact labels with no glyphs", () => {
    setAuthState("authenticated");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation");
    const overviewLink = within(nav).getByRole("link", { name: "Overview" });
    const libraryLink = within(nav).getByRole("link", { name: "Library" });
    const newBatchLink = within(nav).getByRole("link", { name: "New batch" });

    // Accessible names should be clean text without unicode/emoji glyphs
    expect(overviewLink.textContent?.trim()).toBe("Overview");
    expect(libraryLink.textContent?.trim()).toBe("Library");
    expect(newBatchLink.textContent?.trim()).toBe("New batch");
  });

  it("workspace has skip link as first link pointing to the page's only main element", () => {
    setAuthState("authenticated");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    const firstLink = links[0];
    expect(firstLink.textContent).toMatch(/skip to content/i);

    const mains = screen.getAllByRole("main");
    expect(mains).toHaveLength(1);
    const mainId = mains[0].getAttribute("id");
    expect(mainId).toBeTruthy();
    expect(firstLink.getAttribute("href")).toBe(`#${mainId}`);
  });

  it("sign-in page has no skip link", () => {
    setAuthState("unauthenticated");
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );

    const skipLink = screen.queryByRole("link", { name: /skip to content/i });
    expect(skipLink).toBeNull();
  });

  it("sign out button has title containing the user email at all widths", () => {
    const testEmail = "privacy-admin@example.org";
    setAuthState("authenticated", testEmail);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const signOutBtn = screen.getByRole("button", { name: /sign out/i });
    expect(signOutBtn.getAttribute("title")).toBe(testEmail);
  });

  it("icon-only buttons retain accessible names such as the error toast Dismiss button", () => {
    setAuthState("authenticated");
    const onDismiss = vi.fn();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <WorkspaceLayout message={{ id: 1, text: "Redaction failed", variant: "error" }} onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    expect(dismissBtn).toBeDefined();
    expect(dismissBtn.getAttribute("aria-label")).toBe("Dismiss");
  });

  it("banner keeps its text and role with its icon present", () => {
    const { container, rerender } = render(
      <Banner variant="success" role="status">
        Upload complete
      </Banner>,
    );

    const statusBanner = screen.getByRole("status");
    expect(statusBanner.textContent).toContain("Upload complete");
    const successIcon = container.querySelector("svg[aria-hidden='true']");
    expect(successIcon).not.toBeNull();

    rerender(
      <Banner variant="error" role="alert">
        Operation failed
      </Banner>,
    );

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner.textContent).toContain("Operation failed");
    const errorIcon = container.querySelector("svg[aria-hidden='true']");
    expect(errorIcon).not.toBeNull();
  });
});
