/**
 * Generic accessible modal dialog wrapper with backdrop, keyboard Esc dismiss,
 * and focus management.
 *
 * Why: Centralises dialog overlay semantics and keyboard interaction across destructive
 * confirmation modals and media inspection viewers without duplicating backdrop code.
 */
import React, { useEffect, useRef } from "react";

export interface DialogProps {
  open: boolean;
  title: React.ReactNode;
  titleId?: string;
  /**
   * HTML element tag used to render the title container. Defaults to "h3".
   * Use "div" when the title content contains its own heading element (e.g. InlineRename)
   * to prevent invalid HTML heading nesting while preserving the aria-labelledby target.
   */
  titleAs?: "h3" | "div";
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
  size?: "medium" | "large";
}

let openDialogCount = 0;
let previousBodyOverflow = "";

/**
 * Renders a backdrop overlay and modal dialog container conforming to WAI-ARIA dialog patterns.
 */
export function Dialog({
  open,
  title,
  titleId = "dialog-title",
  titleAs = "h3",
  children,
  onClose,
  className = "",
  size = "medium",
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const TitleTag = titleAs;

  // Stop page scrolling while any dialog is open
  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    if (openDialogCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogCount++;

    return () => {
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }
    };
  }, [open]);

  // Focus moves into dialog when opened
  useEffect(() => {
    if (!open) return;
    const dialogEl = dialogRef.current;
    if (dialogEl) {
      const focusable = dialogEl.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable) {
        focusable.focus();
      } else {
        dialogEl.focus();
      }
    }
  }, [open]);

  // Escape key closes the dialog
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Why: Do not dismiss dialog if a child element (e.g. inline rename input) handled Escape
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Backdrop click closes dialog (only when clicking directly on backdrop)
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const sizeClass = size === "large" ? "dialog-large" : "";
  const dialogClasses = ["dialog", sizeClass, className].filter(Boolean).join(" ");

  return (
    <div className="dialog-backdrop" role="presentation" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={dialogClasses}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <TitleTag id={titleId}>{title}</TitleTag>
        {children}
      </div>
    </div>
  );
}
