import React from "react";
import { Link } from "react-router-dom";
import { Bell, Sun, Moon, Monitor, Languages } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useNotificationContext } from "@/contexts/NotificationContext";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useSettingsStore } from "@/store/settings.store";
import { Avatar } from "@/components/common/Avatar";
import { Dropdown } from "@/components/common/Dropdown";

export function Header({ title }: { title?: string }) {
  const { user, logout } = useAuthContext();
  const { unread } = useNotificationContext();
  const { theme, setTheme } = useThemeContext();
  const { settings, save } = useSettingsStore();

  const locale = settings?.locale || "vi";

  // 3-way cycle: dark → light → system → dark
  const cycleOrder: Array<"dark" | "light" | "system"> = ["dark", "light", "system"];
  const currentIndex = cycleOrder.indexOf(theme);
  const nextTheme = cycleOrder[(currentIndex + 1) % cycleOrder.length];

  // Button icon = the mode you'll switch to
  const themeIcons: Record<string, React.ReactNode> = {
    dark: <Sun className="h-4 w-4" />,
    light: <Monitor className="h-4 w-4" />,
    system: <Moon className="h-4 w-4" />,
  };
  const themeTitles: Record<string, string> = {
    dark: locale === "vi" ? "Chuyển sang chế độ Sáng" : "Switch to Light",
    light: locale === "vi" ? "Chuyển sang chế độ Tự động" : "Switch to System",
    system: locale === "vi" ? "Chuyển sang chế độ Tối" : "Switch to Dark",
  };

  const toggleTheme = () => {
    setTheme(nextTheme);
    void save({ theme: nextTheme });
  };

  const toggleLocale = () => {
    const next = locale === "vi" ? "en" : "vi";
    void save({ locale: next });
  };

  return (
    <header
      className="sticky top-0 z-20 flex h-16 items-center justify-between border-b px-4 backdrop-blur md:px-6"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-header-bg)",
      }}
    >
      <div>
        <h1
          className="font-display text-lg font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          {title || "Cloud Platform"}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-xl border p-2 transition hover:opacity-80"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-secondary)",
          }}
          title={themeTitles[theme]}
        >
          {themeIcons[theme]}
        </button>

        {/* Language toggle */}
        <button
          type="button"
          onClick={toggleLocale}
          className="flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-semibold uppercase tracking-wider transition hover:opacity-80"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-accent)",
          }}
          title={locale === "vi" ? "Switch to English" : "Chuyển sang tiếng Việt"}
        >
          <Languages className="h-3.5 w-3.5" />
          <span>{locale === "vi" ? "VI" : "EN"}</span>
        </button>

        {/* Notifications */}
        <Link
          to="/app/notifications"
          className="relative rounded-xl border p-2 transition hover:opacity-80"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-secondary)",
          }}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          ) : null}
        </Link>

        {/* User dropdown */}
        <Dropdown
          trigger={
            <span
              className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <Avatar name={user?.name || "User"} src={user?.avatarUrl} />
              <span
                className="hidden text-sm sm:inline"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {user?.name || "Guest"}
              </span>
            </span>
          }
          items={[
            {
              label: "Profile",
              onClick: () => {
                window.location.href = "/app/profile";
              },
            },
            {
              label: "Settings",
              onClick: () => {
                window.location.href = "/app/settings";
              },
            },
            { label: "Sign out", onClick: () => void logout(), danger: true },
          ]}
        />
      </div>
    </header>
  );
}
