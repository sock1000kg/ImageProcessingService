/**
 * Shared inline rename component supporting keyboard shortcuts (Enter/Escape) and blur save.
 */
import { useEffect, useRef, useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";

export interface InlineRenameProps {
  name: string;
  onSave: (newName: string) => Promise<void> | void;
  headingLevel?: "h2" | "h3";
  className?: string;
  title?: string;
  ariaLabel?: string;
  /**
   * Optional text or element rendered beside the title inside the heading tag
   * (e.g. face count in a dialog header) and preserved next to the input while editing.
   */
  suffix?: React.ReactNode;
}

export function InlineRename({
  name,
  onSave,
  headingLevel = "h2",
  className = "",
  title,
  ariaLabel,
  suffix,
}: InlineRenameProps) {
  const [currentName, setCurrentName] = useState(name);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    setCurrentName(name);
    if (!isEditing) {
      setEditValue(name);
    }
  }, [name, isEditing]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    cancelRef.current = false;
    setError("");
    setEditValue(currentName);
    setIsEditing(true);
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setEditValue(currentName);
    setIsEditing(false);
    setError("");
  };

  const handleSave = async () => {
    if (cancelRef.current || saving) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === currentName) {
      setIsEditing(false);
      setError("");
      setEditValue(currentName);
      return;
    }

    setSaving(true);
    try {
      await onSave(trimmed);
      setCurrentName(trimmed);
      setIsEditing(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
      setIsEditing(false);
      setEditValue(currentName);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`batch-title-container ${className}`.trim()}>
      <div className="batch-title-row">
        {isEditing ? (
          <>
            <input
              ref={inputRef}
              type="text"
              className="batch-title-input"
              value={editValue}
              maxLength={100}
              disabled={saving}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                // Why: Stop propagation on Enter and Escape so parent dialogs or forms do not close or submit while editing
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSave();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCancel();
                }
              }}
              onBlur={() => {
                void handleSave();
              }}
            />
            {suffix && <span>{` ${suffix}`}</span>}
          </>
        ) : (
          <div className="batch-title-display">
            {headingLevel === "h3" ? (
              <h3>
                {currentName}
                {suffix && ` ${suffix}`}
              </h3>
            ) : (
              <h2>
                {currentName}
                {suffix && ` ${suffix}`}
              </h2>
            )}
            <button
              type="button"
              className="pencil-button"
              onClick={handleStartEdit}
              title={title ?? "Rename batch"}
              aria-label={ariaLabel ?? title ?? "Rename batch"}
            >
              <PencilSimple aria-hidden />
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="rename-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
