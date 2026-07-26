import { useEffect, useState } from "react";
import { THEME_KEY } from "@/utils/constants";

export type ThemeMode = "dark" | "light" | "system";

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(
    () => (localStorage.getItem(THEME_KEY) as ThemeMode) || "dark",
  );

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = theme === "dark" || (theme === "system" && prefersDark);
    root.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return { theme, setTheme: setThemeState };
}
