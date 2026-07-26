import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X, Languages, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@researchmind/ui";
import { cn } from "@researchmind/utils";
import { BrandLogo } from "@/components/common/BrandLogo";
import { useI18n } from "@/i18n";
import { useSettingsStore } from "@/store/settings.store";
import { useThemeContext } from "@/contexts/ThemeContext";

const links = [
  { to: "/pricing", key: "nav.pricing" as const },
  { to: "/features", key: "nav.features" as const },
  { to: "/download", key: "nav.download" as const },
  { to: "/docs", key: "nav.docs" as const },
  { to: "/blog", key: "nav.blog" as const },
  { to: "/about", key: "nav.about" as const },
];

const cycleOrder: Array<"dark" | "light" | "system"> = ["dark", "light", "system"];

const themeIcons: Record<string, React.ReactNode> = {
  dark: <Sun className="h-4 w-4" />,
  light: <Monitor className="h-4 w-4" />,
  system: <Moon className="h-4 w-4" />,
};

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { locale, t } = useI18n();
  const save = useSettingsStore((s) => s.save);
  const { theme, setTheme } = useThemeContext();

  const toggleLocale = () => {
    const next = locale === "vi" ? "en" : "vi";
    void save({ locale: next });
  };

  const toggleTheme = () => {
    const currentIndex = cycleOrder.indexOf(theme);
    const nextTheme = cycleOrder[(currentIndex + 1) % cycleOrder.length];
    setTheme(nextTheme);
    void save({ theme: nextTheme });
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <BrandLogo size={32} />
          <span className="font-display text-lg font-bold text-slate-50">
            Research<span className="text-sky-400">Mind</span>
          </span>
        </Link>
        <div className="hidden flex-1 items-center justify-center gap-6 md:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn("text-sm font-medium", isActive ? "text-sky-300" : "text-slate-400 hover:text-slate-200")
              }
            >
              {t(l.key)}
            </NavLink>
          ))}
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <button
            type="button"
            onClick={toggleLocale}
            className="flex items-center gap-1 rounded-lg border border-slate-700/60 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 transition hover:text-slate-200"
            title={locale === "vi" ? "Switch to English" : "Chuyển sang tiếng Việt"}
          >
            <Languages className="h-3.5 w-3.5" />
            <span>{locale === "vi" ? "VI" : "EN"}</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-1 rounded-lg border border-slate-700/60 p-1.5 text-slate-400 transition hover:text-slate-200"
            title={
              theme === "dark"
                ? locale === "vi"
                  ? "Chuyển sang chế độ Sáng"
                  : "Switch to Light"
                : theme === "light"
                  ? locale === "vi"
                    ? "Chuyển sang chế độ Tự động"
                    : "Switch to System"
                  : locale === "vi"
                    ? "Chuyển sang chế độ Tối"
                    : "Switch to Dark"
            }
          >
            {themeIcons[theme]}
          </button>
          <Link to="/login">
            <Button size="sm" variant="secondary">
              {t("nav.signin")}
            </Button>
          </Link>
          <Link to="/app">
            <Button size="sm">{t("nav.openCloud")}</Button>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={toggleLocale}
            className="flex items-center gap-1 rounded-lg border border-slate-700/60 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400"
            title={locale === "vi" ? "Switch to English" : "Chuyển sang tiếng Việt"}
          >
            <Languages className="h-3.5 w-3.5" />
            <span>{locale === "vi" ? "VI" : "EN"}</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center rounded-lg border border-slate-700/60 p-1.5 text-slate-400"
            title="Toggle theme"
          >
            {themeIcons[theme]}
          </button>
          <button type="button" className="text-slate-300" onClick={() => setOpen((v) => !v)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-slate-800 px-4 py-3 md:hidden">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="block py-2 text-sm text-slate-300" onClick={() => setOpen(false)}>
              {t(l.key)}
            </Link>
          ))}
          <Link to="/login" className="mt-2 block text-sm text-sky-300" onClick={() => setOpen(false)}>
            {t("nav.signin")}
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
