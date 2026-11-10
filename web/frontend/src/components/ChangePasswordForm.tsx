import { FormEvent, useState } from "react";
import { changePassword } from "../auth";
import { MessageHandler } from "../types";

export function ChangePasswordForm({ onMessage }: { onMessage?: MessageHandler }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      onMessage?.("New passwords do not match", { variant: "error" });
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onMessage?.("Password changed. Please sign in again on other devices.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "Could not change password", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Change password</h3>
      <label>
        Current password
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </label>
      <label>
        New password
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </label>
      <label>
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </label>
      <button className="secondary-button" type="submit" disabled={saving}>
        {saving ? "Changing..." : "Change password"}
      </button>
    </form>
  );
}
