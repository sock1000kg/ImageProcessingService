// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "../src/components/ChangePasswordForm";
import * as auth from "../src/auth";

describe("ChangePasswordForm", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function fill(current: string, next: string, confirm: string) {
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: current } });
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: next } });
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: confirm } });
    fireEvent.submit(screen.getByRole("form", { name: /change password/i }));
  }

  it("does not send the request when the new passwords differ and says so", async () => {
    const change = vi.spyOn(auth, "changePassword").mockResolvedValue();
    const onMessage = vi.fn();
    render(<ChangePasswordForm onMessage={onMessage} />);

    fill("old-password", "new-password-1", "new-password-2");

    expect(change).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/do not match/i), expect.anything());
  });

  it("changes the password and clears the fields on success", async () => {
    const change = vi.spyOn(auth, "changePassword").mockResolvedValue();
    render(<ChangePasswordForm />);

    fill("old-password", "new-password-1", "new-password-1");

    await waitFor(() => expect(change).toHaveBeenCalledWith("old-password", "new-password-1"));
    await waitFor(() => expect((screen.getByLabelText(/current password/i) as HTMLInputElement).value).toBe(""));
  });
});
