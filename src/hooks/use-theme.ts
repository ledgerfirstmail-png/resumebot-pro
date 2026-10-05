import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "tailorly_theme";

/** Read the persisted theme (defaults to light — the clay palette is the brand). */
function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Apply the persisted theme before React renders (call once at module load in
 * main.tsx) so a stored dark mode never flashes light on refresh.
 */
export function applyStoredTheme(): void {
  try {
    document.documentElement.classList.toggle("dark", readStoredTheme() === "dark");
  } catch {
    /* storage unavailable — stay light */
  }
}

/** Theme state for the header toggle: keeps `.dark` on <html> and persists. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage unavailable — session-only theme */
    }
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, toggle };
}
