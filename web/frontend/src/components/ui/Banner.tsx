/**
 * Shared alert banner component for status, warning, and error messages.
 */
import React from "react";

export type BannerVariant = "error" | "success" | "warning";

export interface BannerProps {
  variant: BannerVariant;
  children: React.ReactNode;
  role?: string;
  className?: string;
}

/**
 * Renders a full-width message banner matching theme colours and accessible role semantics.
 */
export function Banner({ variant, children, role = "status", className = "" }: BannerProps) {
  const baseClass = `${variant}-banner`;
  const combined = className ? `${className} ${baseClass}` : baseClass;
  return (
    <div className={combined} role={role}>
      {children}
    </div>
  );
}
