import React, { useEffect, useState } from "react";
import { Button } from "@researchmind/ui";
import { Cloud, FileText, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useReports } from "@/hooks/useReports";
import { useActivity } from "@/hooks/useActivity";
import { getAnalytics } from "@/services/analytics";
import type { AnalyticsSummary } from "@researchmind/types";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentList } from "@/components/dashboard/RecentList";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { Loading } from "@/components/common/Loading";
import { EmptyState } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";
import { t, tpl } from "@/i18n";

export default function DashboardPage() {
  const { workspaces, loading: wsLoading, error: wsError } = useWorkspace();
  const { reports, loading: rptLoading, error: rptError } = useReports();
  const { activity, error: actError } = useActivity();
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");

  useEffect(() => {
    getAnalytics()
      .then(setAnalytics)
      .catch((e) => setAnalyticsError(e instanceof Error ? e.message : "Analytics failed"));
  }, []);

  const hasAnyError = Boolean(wsError || rptError || actError || analyticsError);

  if (wsLoading || rptLoading || (!analytics && !analyticsError)) {
    return <Loading label={t("common.loading")} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="page-title">{t("dashboard.title")}</h2>
          <p className="page-subtitle">{t("dashboard.subtitle")}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" /> {t("dashboard.cloudPlatform")}
        </span>
      </div>

      {/* Error state */}
      {hasAnyError ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center">
          <h3 className="text-base font-semibold text-rose-200">{t("dashboard.error.title")}</h3>
          <p className="mt-2 text-sm text-rose-300">{t("dashboard.error.description")}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            {t("dashboard.error.retry")}
          </Button>
        </div>
      ) : null}

      {/* Empty state when no analytics data */}
      {!hasAnyError && analytics && analytics.workspaces + analytics.papers + analytics.reports === 0 ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("dashboard.stat.workspaces")} value={0} sub={t("dashboard.stat.workspacesSub")} color="#38bdf8" />
            <StatCard label={t("dashboard.stat.reports")} value={0} sub={t("dashboard.stat.reportsSub")} color="#34d399" />
            <StatCard label={t("dashboard.stat.papers")} value={0} sub={t("dashboard.stat.papersSub")} color="#a855f7" />
            <StatCard label={t("dashboard.stat.backup")} value="0 MB" sub="" color="#f59e0b" />
          </div>
          <EmptyState
            title={t("dashboard.empty.title")}
            description={t("dashboard.empty.description")}
            action={<Button size="sm" variant="secondary">{t("dashboard.empty.action")}</Button>}
          />
        </div>
      ) : analytics ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("dashboard.stat.workspaces")} value={analytics.workspaces} sub={t("dashboard.stat.workspacesSub")} color="#38bdf8" />
          <StatCard
            label={t("dashboard.stat.reports")}
            value={reports.length || analytics.reports}
            sub={t("dashboard.stat.reportsSub")}
            color="#34d399"
          />
          <StatCard label={t("dashboard.stat.papers")} value={analytics.papers} sub={t("dashboard.stat.papersSub")} color="#a855f7" />
          <StatCard
            label={t("dashboard.stat.backup")}
            value={`${analytics.storageMb ?? 0} MB`}
            sub={tpl("dashboard.stat.backupSub", { count: analytics.activityLast7d ?? 0 })}
            color="#f59e0b"
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentList
          title={t("dashboard.recent.workspaces")}
          icon={<Cloud className="h-4 w-4 text-sky-400" />}
          empty={t("dashboard.empty.title")}
          items={workspaces.map((w) => ({
            id: w.id,
            title: w.name,
            subtitle: `${w.paperCount} ${t("common.papers")} · ${formatRelativeTime(w.updatedAt)}`,
            badge: w.syncState,
            href: `/app/workspaces/${w.id}`,
          }))}
        />
        <RecentList
          title={t("dashboard.recent.reports")}
          icon={<FileText className="h-4 w-4 text-emerald-400" />}
          empty={t("reports.empty.title")}
          items={reports.map((r) => ({
            id: r.id,
            title: r.title,
            subtitle: r.url,
            badge: r.type,
            href: `/r/${r.id}`,
          }))}
        />
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold text-slate-100">{t("dashboard.activity.title")}</h3>
        {activity.length ? (
          <ActivityFeed items={activity.slice(0, 8)} />
        ) : (
          <EmptyState title={t("dashboard.activity.empty")} description={t("dashboard.activity.emptyDesc")} />
        )}
      </div>
    </div>
  );
}
