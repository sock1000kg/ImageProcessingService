/**
 * Custom hook managing active theme state (light or dark mode).
 * Reads the initial theme from document.documentElement.dataset.theme (falling back
 * to "light" if unset), writes changes to the dataset and localStorage on toggle,
 * and follows OS color scheme preferences until the user explicitly makes a choice.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type Theme = "light" | "dark";

export interface UseThemeResult {
  theme: Theme;
  toggleTheme: () => void;
}

/**
 * Safely retrieve the persisted theme choice from localStorage without throwing.
 */
function getStoredTheme(): string | null {
  try {
    return localStorage.getItem("theme");
  } catch {
    return null;
  }
}

/**
 * Read the initial theme from the document root dataset, falling back to "light".
 */
function getInitialTheme(): Theme {
  if (typeof document !== "undefined" && document.documentElement?.dataset?.theme) {
    const current = document.documentElement.dataset.theme;
    if (current === "dark" || current === "light") {
      return current;
    }
  }
  return "light";
}

/**
 * Manage and toggle light/dark theme with DOM synchronization and OS preference tracking.
 */
export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  // Track if the user has made an explicit choice in this session or in storage
  const hasUserPickedRef = useRef<boolean>(getStoredTheme() !== null);

  useEffect(() => {
    // If the user has already chosen a theme, ignore OS preference changes
    if (hasUserPickedRef.current || getStoredTheme() !== null) {
      return;
    }

    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    if (!mql) {
      return;
    }

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (hasUserPickedRef.current || getStoredTheme() !== null) {
        return;
      }
      const nextTheme: Theme = e.matches ? "dark" : "light";
      if (typeof document !== "undefined") {
        document.documentElement.dataset.theme = nextTheme;
      }
      setTheme(nextTheme);
    };

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange);
    } else if (typeof (mql as unknown as { addListener?: (cb: unknown) => void }).addListener === "function") {
      (mql as unknown as { addListener: (cb: unknown) => void }).addListener(handleChange);
    }

    return () => {
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", handleChange);
      } else if (typeof (mql as unknown as { removeListener?: (cb: unknown) => void }).removeListener === "function") {
        (mql as unknown as { removeListener: (cb: unknown) => void }).removeListener(handleChange);
      }
    };
  }, []);

  const toggleTheme = useCallback(() => {
    hasUserPickedRef.current = true;
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.dataset.theme = next;
      }
      try {
        localStorage.setItem("theme", next);
      } catch {
        // Handle restricted or failing localStorage environments gracefully
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
