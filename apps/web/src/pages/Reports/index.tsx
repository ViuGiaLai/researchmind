import React, { useMemo, useState } from "react";
import { useReports } from "@/hooks/useReports";
import { ReportRow } from "@/components/reports/ReportRow";
import { SearchBar } from "@/components/common/SearchBar";
import { Tabs } from "@/components/common/Tabs";
import { Loading } from "@/components/common/Loading";
import { Button, EmptyState } from "@researchmind/ui";
import { FileText } from "lucide-react";
import { t } from "@/i18n";

export default function ReportsPage() {
  const { reports, loading } = useReports();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      const matchQ = r.title.toLowerCase().includes(q.toLowerCase()) || r.id.includes(q);
      const matchTab =
        tab === "all" ||
        (tab === "live" && r.type === "Live Report") ||
        (tab === "snapshot" && r.type === "Snapshot");
      return matchQ && matchTab;
    });
  }, [reports, q, tab]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{t("reports.title")}</h2>
        <p className="page-subtitle">{t("reports.subtitle")}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: t("reports.tab.all") },
            { id: "live", label: t("reports.tab.live") },
            { id: "snapshot", label: t("reports.tab.snapshots") },
          ]}
        />
        <SearchBar value={q} onChange={setQ} placeholder={t("reports.search")} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={t("reports.empty.title")}
          description={t("reports.empty.description")}
          action={<Button size="sm" variant="secondary">{t("reports.empty.action")}</Button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}
