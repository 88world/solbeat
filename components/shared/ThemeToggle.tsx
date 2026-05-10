"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "solbeat:theme";

/**
 * Theme toggle. Reads/writes data-theme on the document root and persists
 * to localStorage. Light is the default (the brand identity); dark is for
 * the degens watching the page at 2am between trades. The setup script in
 * layout.tsx applies the saved theme before React hydrates so there's no
 * flash on page load.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "light";
    setTheme(stored);
    document.documentElement.dataset.theme = stored;
  }, []);

  const flip = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
  };

  // Avoid SSR/CSR mismatch — render a placeholder until mounted.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className="size-9 rounded-full inline-flex items-center justify-center"
        style={{ background: "transparent" }}
      />
    );
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="size-9 rounded-full inline-flex items-center justify-center transition-all relative overflow-hidden group"
      style={{
        background: "var(--bg-glass)",
        boxShadow: "inset 0 0 0 1px var(--border-subtle)",
      }}
    >
      {/* Sun icon — visible in dark mode (means "switch to light") */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute transition-all duration-500"
        style={{
          opacity: isDark ? 1 : 0,
          transform: isDark ? "rotate(0deg) scale(1)" : "rotate(90deg) scale(0)",
          color: "#FFB938",
        }}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      {/* Moon icon — visible in light mode (means "switch to dark") */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute transition-all duration-500"
        style={{
          opacity: isDark ? 0 : 1,
          transform: isDark ? "rotate(-90deg) scale(0)" : "rotate(0deg) scale(1)",
          color: "#5E5CFF",
        }}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}

/**
 * Inline script source for layout.tsx. Sets data-theme on <html> before
 * React hydrates so there's no flash. Reads localStorage; falls back to
 * light. We deliberately do NOT honor prefers-color-scheme by default,
 * the brand chose light, dark is opt-in.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('${STORAGE_KEY}') || 'light';
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;
