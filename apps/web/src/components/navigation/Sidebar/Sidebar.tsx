import React from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  Cloud,
  CreditCard,
  Database,
  FileText,
  HelpCircle,
  KeyRound,
  Layers,
  MessageSquare,
  Settings,
  Smartphone,
  Users,
  Camera,
} from "lucide-react";
import { cn } from "@researchmind/utils";
import { BrandLogo } from "@/components/common/BrandLogo";
import { t } from "@/i18n";

const items = [
  { to: "/app", label: () => t("nav.dashboard"), icon: Layers, end: true },
  { to: "/app/workspaces", label: () => t("nav.workspaces"), icon: Cloud },
  { to: "/app/reports", label: () => t("nav.reports"), icon: FileText },
  { to: "/app/snapshots", label: () => t("nav.snapshots"), icon: Camera },
  { to: "/app/activity", label: () => t("nav.activity"), icon: Activity },
  { to: "/app/analytics", label: () => t("nav.analytics"), icon: BarChart3 },
  { to: "/app/notifications", label: () => t("nav.notifications"), icon: Bell },
  { to: "/app/backups", label: () => t("nav.backups"), icon: Database },
  { to: "/app/devices", label: () => t("nav.devices"), icon: Smartphone },
  { to: "/app/team", label: () => t("nav.team"), icon: Users },
  { to: "/app/billing", label: () => t("nav.billing"), icon: CreditCard },
  { to: "/app/api-keys", label: () => t("nav.apiKeys"), icon: KeyRound },
  { to: "/app/settings", label: () => t("nav.settings"), icon: Settings },
  { to: "/app/help", label: () => t("nav.help"), icon: HelpCircle },
  { to: "/app/feedback", label: () => t("nav.feedback"), icon: MessageSquare },
];

export function Sidebar() {
  return (
    <aside
      className="hidden w-[260px] shrink-0 border-r lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col"
      style={{
        borderColor: "var(--color-sidebar-border)",
        backgroundColor: "var(--color-sidebar-bg)",
      }}
    >
      <div
        className="flex h-16 items-center gap-2 border-b px-5"
        style={{ borderColor: "var(--color-border)" }}
      >
        <BrandLogo size={32} />
        <div>
          <div
            className="font-display text-sm font-bold"
            style={{ color: "var(--color-text)" }}
          >
            ResearchMind
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>
            {t("nav.cloud")}
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "theme-surface text-sky-300"
                  : "theme-text-muted hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-200",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label()}
          </NavLink>
        ))}
      </nav>
      <div
        className="border-t p-4 text-xs"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
        }}
      >
        Desktop là IDE nghiên cứu · Cloud là cộng tác & báo cáo
      </div>
    </aside>
  );
}
