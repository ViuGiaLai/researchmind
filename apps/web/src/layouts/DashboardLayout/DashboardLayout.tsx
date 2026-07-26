import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Header } from "@/components/navigation/Header";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { t } from "@/i18n";

const titles: Record<string, () => string> = {
  "/app": () => t("dashboard.title"),
  "/app/workspaces": () => t("workspaces.title"),
  "/app/reports": () => t("reports.title"),
  "/app/snapshots": () => t("snapshots.title"),
  "/app/activity": () => t("activity.title"),
  "/app/analytics": () => t("analytics.title"),
  "/app/notifications": () => t("notifications.title"),
  "/app/backups": () => t("backups.title"),
  "/app/devices": () => t("devices.title"),
  "/app/team": () => t("team.title"),
  "/app/billing": () => t("billing.title"),
  "/app/settings": () => t("settings.title"),
  "/app/profile": () => t("profile.title"),
  "/app/api-keys": () => t("apiKeys.title"),
  "/app/help": () => t("help.title"),
  "/app/feedback": () => t("feedback.title"),
};

export function DashboardLayout() {
  const { pathname } = useLocation();
  const title =
    titles[pathname]?.() ||
    (pathname.startsWith("/app/workspaces/") ? t("workspaces.title") : "ResearchMind Cloud");

  return (
    <WorkspaceProvider>
      <NotificationProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <Header title={title} />
            <div className="flex-1 px-4 py-6 md:px-6">
              <Outlet />
            </div>
          </div>
        </div>
      </NotificationProvider>
    </WorkspaceProvider>
  );
}
