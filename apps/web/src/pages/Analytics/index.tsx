import React, { useEffect, useState } from "react";
import type { AnalyticsSummary, SystemService } from "@researchmind/types";
import { getAnalytics } from "@/services/analytics";
import { Loading } from "@/components/common/Loading";
import { Card, CardContent, EmptyState } from "@researchmind/ui";
import { formatRelativeTime, formatBytes } from "@researchmind/utils";
import { t } from "@/i18n";
import { Activity, Monitor, TrendingUp, BarChart3 } from "lucide-react";

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-slate-400">{icon}</div>
        </div>
        <div className="mt-1 text-2xl font-bold text-slate-50">{value}</div>
        {sub && <div className="text-[11px] text-slate-600">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function HealthBadge({ status }: { status: SystemService["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    healthy: { label: t("analytics.systemHealth.healthy"), cls: "bg-emerald-500/20 text-emerald-400" },
    degraded: { label: t("analytics.systemHealth.degraded"), cls: "bg-amber-500/20 text-amber-400" },
    down: { label: t("analytics.systemHealth.down"), cls: "bg-rose-500/20 text-rose-400" },
  };
  const s = map[status] || map.degraded;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.label}</span>;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  useEffect(() => {
    getAnalytics().then(setData);
  }, []);
  if (!data) return <Loading />;

  const hasData = data.workspaces + data.papers + data.reports > 0;

  if (!hasData) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="page-title">{t("analytics.title")}</h2>
          <p className="page-subtitle">{t("analytics.subtitle")}</p>
        </div>
        <EmptyState
          icon={<Activity className="h-8 w-8" />}
          title={t("analytics.empty.title")}
          description={t("analytics.empty.description")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">{t("analytics.title")}</h2>
        <p className="page-subtitle">{t("analytics.subtitle")}</p>
      </div>

      {/* 📊 Overview */}
      <div>
        <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.overview")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<BarChart3 className="h-4 w-4" />} label={t("analytics.overview.workspaces")} value={data.workspaces} />
          <StatCard icon={<Activity className="h-4 w-4" />} label={t("analytics.overview.papers")} value={data.papers} />
          <StatCard icon={<BarChart3 className="h-4 w-4" />} label={t("analytics.overview.reports")} value={data.reports} sub={`${data.snapshots} ${t("analytics.overview.snapshots")}`} />
          <StatCard icon={<Activity className="h-4 w-4" />} label={t("analytics.overview.aiChats")} value={data.aiChats} />
        </div>
      </div>

      {/* ☁️ Cloud */}
      <div>
        <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.cloud")}</h3>
        <Card>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div><div className="text-xs text-slate-500">{t("analytics.cloud.storageUsed")}</div><div className="text-lg font-semibold text-slate-100">{formatBytes(data.storageMb * 1024 * 1024)}</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.cloud.backupSize")}</div><div className="text-lg font-semibold text-slate-100">{formatBytes(data.backupSizeMb * 1024 * 1024)}</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.cloud.lastBackup")}</div><div className="text-lg font-semibold text-slate-100">{data.lastBackupAt ? formatRelativeTime(data.lastBackupAt) : t("analytics.cloud.never")}</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.cloud.pendingSync")}</div><div className="text-lg font-semibold text-amber-300">{data.pendingSync}</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.cloud.failedSync")}</div><div className="text-lg font-semibold text-rose-300">{data.failedSync}</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.cloud.lastSync")}</div><div className="text-lg font-semibold text-slate-100">{data.lastSyncAt ? formatRelativeTime(data.lastSyncAt) : t("analytics.cloud.never")}</div></div>
          </CardContent>
        </Card>
      </div>

      {/* 💻 Devices */}
      {data.devices.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.devices")}</h3>
          <div className="space-y-2">
            {data.devices.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Monitor className="h-4 w-4 text-slate-400" />
                    <div>
                      <span className="text-sm font-medium text-slate-200">{d.name}</span>
                      <span className="ml-2 text-xs text-slate-500">{d.platform}</span>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs ${d.trusted ? "text-emerald-400" : "text-slate-500"}`}>
                    <span className={`h-2 w-2 rounded-full ${d.trusted ? "bg-emerald-500" : "bg-slate-600"}`} />
                    {d.trusted ? t("analytics.devices.online") : t("analytics.devices.offline")}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 🤖 AI Usage */}
      <div>
        <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.aiUsage")}</h3>
        <Card>
          <CardContent className="space-y-2">
            {data.aiUsage.length === 0 ? (
              <p className="text-sm text-slate-500">{t("analytics.aiUsage.noData")}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.aiUsage.map((a) => (
                  <div key={a.provider} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <span className="text-sm font-medium text-slate-200">{a.provider}</span>
                    <div className="text-right">
                      <div className="text-sm text-slate-100">{a.requests.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-500">{t("analytics.aiUsage.requests")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 📈 Research Progress */}
      <div>
        <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.researchProgress")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label={t("analytics.researchGrowth.papersPerWeek")} value={data.researchGrowth.papersPerWeek} />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label={t("analytics.researchGrowth.kgNodes")} value={data.researchGrowth.kgNodes} />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label={t("analytics.researchGrowth.evidenceExtracted")} value={data.researchGrowth.evidenceExtracted} />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label={t("analytics.researchGrowth.contradictions")} value={data.researchGrowth.contradictionsFound} />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label={t("analytics.researchGrowth.reportsGenerated")} value={data.researchGrowth.reportsGenerated} />
        </div>
      </div>

      {/* 📚 Stats */}
      <div>
        <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.researchStats")}</h3>
        <Card>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {data.researchStats.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-950/30 px-3 py-2">
                <span className="text-xs text-slate-500">{s.label}</span>
                <span className="text-sm font-medium text-slate-200">{s.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* 💳 Subscription */}
      <div>
        <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.subscription")}</h3>
        <Card>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <div><div className="text-xs text-slate-500">{t("analytics.subscription.plan")}</div><div className="text-lg font-semibold text-sky-300">{t("billing.plans.free")}</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.subscription.aiCredits")}</div><div className="text-lg font-semibold text-emerald-300">—</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.subscription.storageRemaining")}</div><div className="text-lg font-semibold text-slate-100">—</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.subscription.nextBilling")}</div><div className="text-lg font-semibold text-slate-100">—</div></div>
          </CardContent>
        </Card>
      </div>

      {/* ⚠️ System Health */}
      <div>
        <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.systemHealth")}</h3>
        <Card>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.services.map((svc) => (
              <div key={svc.name} className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-950/30 px-3 py-2">
                <span className="text-sm text-slate-300">{svc.name}</span>
                <HealthBadge status={svc.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* 🛡 Security */}
      <div>
        <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.security")}</h3>
        <Card>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div><div className="text-xs text-slate-500">{t("analytics.security.lastLogin")}</div><div className="text-sm font-medium text-slate-200">{data.lastLogin ? formatRelativeTime(data.lastLogin) : "—"}</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.security.devicesLoggedIn")}</div><div className="text-sm font-medium text-slate-200">{data.sessionCount}</div></div>
            <div><div className="text-xs text-slate-500">{t("analytics.security.twoFactor")}</div><div className="text-sm font-medium text-amber-300">{t("analytics.security.disabled")}</div></div>
          </CardContent>
        </Card>
      </div>

      {/* 📋 Monthly Summary */}
      {data.monthlySummary && (
        <div>
          <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("analytics.sections.monthlySummary")}</h3>
          <Card>
            <CardContent className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 text-sm"><span className="text-slate-400">+{data.monthlySummary.papersAdded}</span><span className="text-slate-500">{t("analytics.monthly.papers")}</span></div>
              <div className="flex items-center gap-2 text-sm"><span className="text-slate-400">+{data.monthlySummary.reportsCreated}</span><span className="text-slate-500">{t("analytics.monthly.reports")}</span></div>
              <div className="flex items-center gap-2 text-sm"><span className="text-slate-400">+{data.monthlySummary.aiChats}</span><span className="text-slate-500">{t("analytics.monthly.aiChats")}</span></div>
              <div className="flex items-center gap-2 text-sm"><span className="text-slate-400">+{data.monthlySummary.backups}</span><span className="text-slate-500">{t("analytics.monthly.backups")}</span></div>
              <div className="flex items-center gap-2 text-sm"><span className="text-slate-400">+{data.monthlySummary.snapshots}</span><span className="text-slate-500">{t("analytics.monthly.snapshots")}</span></div>
              <div className="flex items-center gap-2 text-sm"><span className="text-slate-400">+{data.monthlySummary.graphUpdates}</span><span className="text-slate-500">{t("analytics.monthly.graphUpdates")}</span></div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
