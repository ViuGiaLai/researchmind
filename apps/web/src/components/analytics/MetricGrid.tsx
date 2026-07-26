import React from "react";
import type { AnalyticsSummary } from "@researchmind/types";
import { StatCard } from "@/components/dashboard/StatCard";
import { t } from "@/i18n";

export function MetricGrid({ data }: { data: AnalyticsSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label={t("analytics.stat.workspaces")} value={data.workspaces} sub={t("common.syncedFrom")} color="#38bdf8" />
      <StatCard label={t("analytics.stat.reports")} value={data.reports} sub={`${data.snapshots} snapshots`} color="#34d399" />
      <StatCard label={t("analytics.stat.papers")} value={data.papers} sub={`${data.storageMb ?? 0} MB`} color="#a855f7" />
      <StatCard label={t("analytics.stat.syncHealth")} value={`${data.syncHealth ?? 0}%`} sub={`${data.activityLast7d ?? 0} events / 7d`} color="#f59e0b" />
    </div>
  );
}
