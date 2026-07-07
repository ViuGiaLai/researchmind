export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "app-theme";

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    /* ignore */
  }
  return "system";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? getSystemTheme() : pref;
}

export function applyTheme(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-pref", pref);
  document.documentElement.setAttribute("data-design", "ai-workspace");
  return resolved;
}

export function setThemePreference(pref: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  return applyTheme(pref);
}

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

export function initTheme(): ResolvedTheme {
  const pref = getThemePreference();
  const resolved = applyTheme(pref);

  if (mediaListener) {
    window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", mediaListener);
    mediaListener = null;
  }

  mediaListener = () => {
    if (getThemePreference() === "system") applyTheme("system");
  };
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", mediaListener);

  return resolved;
}
