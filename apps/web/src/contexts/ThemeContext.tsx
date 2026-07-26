import React, { createContext, useContext } from "react";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";

const ThemeContext = createContext<ReturnType<typeof useTheme> | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}

export type { ThemeMode };
