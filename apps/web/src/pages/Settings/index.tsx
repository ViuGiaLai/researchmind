import React, { useEffect } from "react";
import { useSettingsStore } from "@/store/settings.store";
import { Card, CardContent } from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { t } from "@/i18n";

export default function SettingsPage() {
  const { settings, loading, load, save } = useSettingsStore();
  const { user } = useAuthContext();
  const { theme, setTheme } = useThemeContext();

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !settings) return <Loading />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{t("settings.title")}</h2>
        <p className="page-subtitle">{t("settings.subtitle")}</p>
      </div>
      <Card>
        <CardContent className="space-y-4">
          <h3 className="text-sm font-semibold text-primary">{t("settings.profile")}</h3>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t("settings.profile.name")}</span>
            <input
              className="h-8 rounded-lg border border-border bg-background px-2 text-right text-sm text-foreground"
              value={user?.name || ""}
              readOnly
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t("settings.profile.email")}</span>
            <input
              className="h-8 rounded-lg border border-border bg-background px-2 text-right text-sm text-foreground"
              value={user?.email || ""}
              readOnly
            />
          </label>

          <hr className="border-border" />

          <h3 className="text-sm font-semibold text-foreground">{t("settings.notifications")}</h3>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t("settings.notifications.email")}</span>
            <input
              type="checkbox"
              checked={settings.emailNotifications}
              onChange={(e) => void save({ emailNotifications: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t("settings.notifications.digest")}</span>
            <input
              type="checkbox"
              checked={settings.weeklyDigest}
              onChange={(e) => void save({ weeklyDigest: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t("settings.notifications.autoBackup")}</span>
            <input
              type="checkbox"
              checked={settings.autoBackup}
              onChange={(e) => void save({ autoBackup: e.target.checked })}
            />
          </label>

          <hr className="border-border" />

          <h3 className="text-sm font-semibold text-foreground">{t("settings.preferences")}</h3>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t("settings.notifications.visibility")}</span>
            <select
              className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
              value={settings.defaultVisibility}
              onChange={(e) => void save({ defaultVisibility: e.target.value as any })}
            >
              <option value="public">{t("settings.visibility.public")}</option>
              <option value="unlisted">{t("settings.visibility.unlisted")}</option>
              <option value="private">{t("settings.visibility.private")}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t("settings.preferences.theme")}</span>
            <select
              className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
              value={theme}
              onChange={(e) => {
                const v = e.target.value as "dark" | "light" | "system";
                setTheme(v);
                void save({ theme: v });
              }}
            >
              <option value="dark">{t("settings.theme.dark")}</option>
              <option value="light">{t("settings.theme.light")}</option>
              <option value="system">{t("settings.theme.system")}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t("settings.preferences.language")}</span>
            <select
              className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
              value={settings.locale}
              onChange={(e) => void save({ locale: e.target.value as "en" | "vi" })}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>

          <hr className="border-border" />

          <h3 className="text-sm font-semibold text-foreground">{t("settings.ai")}</h3>
          <p className="text-xs text-muted-foreground">{t("settings.ai.provider")}</p>
          <p className="text-xs text-muted-foreground">{t("settings.ai.apiKey")}</p>

          <hr className="border-border" />

          <h3 className="text-sm font-semibold text-foreground">{t("settings.experimental")}</h3>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t("settings.experimental.toggle")}</span>
            <input type="checkbox" />
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
