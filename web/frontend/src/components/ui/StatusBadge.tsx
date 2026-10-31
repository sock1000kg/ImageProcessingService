/**
 * Shared status indicator component supporting pills, dots, and review badges.
 */
import React from "react";

export type StatusBadgeVariant = "badge" | "dot" | "pill";

export interface StatusBadgeProps {
  status?: string;
  variant?: StatusBadgeVariant;
  label?: string;
  className?: string;
}

/**
 * Renders status visual elements with consistent CSS classes and token colours.
 */
export function StatusBadge({ status, variant = "badge", label, className = "" }: StatusBadgeProps) {
  if (variant === "dot") {
    const statusClass = (status ?? "").toLowerCase();
    return <span className={`status-dot ${statusClass} ${className}`.trim()} />;
  }

  if (variant === "pill") {
    return <span className={`review-pill ${className}`.trim()}>{label ?? "Needs review"}</span>;
  }

  const statusClass = (status ?? "").toLowerCase();
  return <span className={`status ${statusClass} ${className}`.trim()}>{label ?? status}</span>;
}
