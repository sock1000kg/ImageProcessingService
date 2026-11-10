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

  // Same field and button classes as the "Create an allow list" form, so the dashboard forms look alike.
  const fields = [
    {
      id: "current-password",
      label: "Current password",
      value: currentPassword,
      set: setCurrentPassword,
      autoComplete: "current-password",
    },
    {
      id: "new-password",
      label: "New password",
      value: newPassword,
      set: setNewPassword,
      autoComplete: "new-password",
      minLength: 8,
    },
    {
      id: "confirm-password",
      label: "Confirm new password",
      value: confirmPassword,
      set: setConfirmPassword,
      autoComplete: "new-password",
      minLength: 8,
    },
  ];

  return (
    <form className="saved-face-lists-form" aria-label="Change password" onSubmit={submit}>
      <h3 className="saved-face-lists-form-title">Change password</h3>
      {fields.map((field) => (
        <div className="batch-name-group" key={field.id}>
          <label htmlFor={field.id} className="mini-label">
            {field.label}
          </label>
          <input
            id={field.id}
            type="password"
            className="text-input space-above-1"
            autoComplete={field.autoComplete}
            minLength={field.minLength}
            value={field.value}
            onChange={(e) => field.set(e.target.value)}
            disabled={saving}
            required
          />
        </div>
      ))}
      <button type="submit" className="primary-button saved-face-lists-submit" disabled={saving}>
        {saving ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
