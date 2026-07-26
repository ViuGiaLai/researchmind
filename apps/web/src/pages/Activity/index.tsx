import React, { useMemo, useState } from "react";
import { useActivity } from "@/hooks/useActivity";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { Tabs } from "@/components/common/Tabs";
import { Loading } from "@/components/common/Loading";
import { EmptyState } from "@researchmind/ui";
import { History } from "lucide-react";
import { t } from "@/i18n";

const filterTabs: { id: string; label: string }[] = [
  { id: "all", label: t("activity.filters.all") },
  { id: "research", label: t("activity.filters.research") },
  { id: "ai", label: t("activity.filters.ai") },
  { id: "reports", label: t("activity.filters.reports") },
  { id: "cloud", label: t("activity.filters.cloud") },
  { id: "team", label: t("activity.filters.team") },
  { id: "security", label: t("activity.filters.security") },
];

export default function ActivityPage() {
  const { activity, loading } = useActivity();
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return activity;
    return activity.filter((a) => a.category === filter);
  }, [activity, filter]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{t("activity.title")}</h2>
        <p className="page-subtitle">{t("activity.subtitle")}</p>
      </div>

      <Tabs value={filter} onChange={setFilter} tabs={filterTabs} />

      {activity.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title={t("activity.empty.title")}
          description={t("activity.empty.description")}
          action={
            <div className="space-y-2 w-full max-w-sm text-left text-sm text-slate-500">
              <p className="font-medium text-slate-400">{t("activity.empty.triggers")}</p>
              <p>{t("activity.empty.trigger1")}</p>
              <p>{t("activity.empty.trigger2")}</p>
              <p>{t("activity.empty.trigger3")}</p>
              <p>{t("activity.empty.trigger4")}</p>
              <p>{t("activity.empty.trigger5")}</p>
              <p>{t("activity.empty.trigger6")}</p>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title={t("activity.empty.title")}
          description={t("activity.empty.description")}
        />
      ) : (
        <ActivityFeed items={filtered} />
      )}
    </div>
  );
}
