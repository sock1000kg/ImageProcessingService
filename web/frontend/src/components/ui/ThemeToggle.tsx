/**
 * Theme toggle button switching between light and dark modes (DESIGN.md §5).
 * Extends .icon-button, showing the target theme's icon (Moon in light mode,
 * Sun in dark mode) with matching accessible aria-label.
 */
import { Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "../../hooks/useTheme";

export interface ThemeToggleProps {
  className?: string;
}

/**
 * Toggle button that triggers theme switching between light and dark modes.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className={`icon-button ${className || ""}`.trim()}
      aria-label={label}
      onClick={toggleTheme}
      title={label}
    >
      {isDark ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
    </button>
  );
}
