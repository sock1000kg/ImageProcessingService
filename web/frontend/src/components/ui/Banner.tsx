/**
 * Shared alert banner component for status, warning, and error messages.
 */
import React from "react";
import { CheckCircle, Warning, WarningCircle } from "@phosphor-icons/react";

export type BannerVariant = "error" | "success" | "warning";

export interface BannerProps {
  variant: BannerVariant;
  children: React.ReactNode;
  role?: string;
  className?: string;
}

const VARIANT_ICONS = {
  success: CheckCircle,
  warning: Warning,
  error: WarningCircle,
} as const;

/**
 * Renders a full-width message banner matching theme colours and accessible role semantics.
 */
export function Banner({ variant, children, role = "status", className = "" }: BannerProps) {
  const Icon = VARIANT_ICONS[variant];
  const baseClass = `${variant}-banner`;
  const combined = className ? `${className} ${baseClass}` : baseClass;
  return (
    <div className={combined} role={role}>
      <Icon aria-hidden="true" className="banner-icon" />
      {children}
    </div>
  );
}
