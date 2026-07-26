import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { WorkspaceCard } from "@/components/workspace/WorkspaceCard";
import { SearchBar } from "@/components/common/SearchBar";
import { Loading } from "@/components/common/Loading";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { Badge, Button, Card, CardContent } from "@researchmind/ui";
import { Tabs } from "@/components/common/Tabs/Tabs";
import { t } from "@/i18n";
import { formatRelativeTime } from "@researchmind/utils";
import { FolderOpen, Download, BookOpen, PlayCircle } from "lucide-react";

// ─── Tab panel for workspace detail ───
function WorkspaceDetailTabs({ ws }: { ws: any }) {
  const [activeTab, setActiveTab] = useState("overview");

  const tabItems = [
    { id: "overview", label: t("workspaces.tabs.overview") },
    { id: "reports", label: t("workspaces.tabs.reports") },
    { id: "backup", label: t("workspaces.tabs.backup") },
    { id: "activity", label: t("workspaces.tabs.activity") },
    { id: "members", label: t("workspaces.tabs.members") },
  ];

  return (
    <div className="space-y-4">
      <Tabs tabs={tabItems} value={activeTab} onChange={setActiveTab} />

      {/* Overview */}
      {activeTab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent>
                <div className="text-xs text-slate-500">📄 {t("workspaces.detail.papers")}</div>
                <div className="text-2xl font-bold text-sky-300">{ws.paperCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-xs text-slate-500">📊 {t("workspaces.detail.reports")}</div>
                <div className="text-2xl font-bold text-emerald-300">{ws.reportCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-xs text-slate-500">🧠 {t("workspaces.detail.knowledgeGraph")}</div>
                <div className="text-2xl font-bold text-violet-300">✓</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-xs text-slate-500">👥 {t("workspaces.detail.members")}</div>
                <div className="text-2xl font-bold text-amber-300">{ws.memberCount}</div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="space-y-2 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <span>{t("workspaces.detail.owner")}:</span>
                <span className="text-slate-200 font-medium">{ws.ownerUid}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{t("workspaces.detail.updated")}:</span>
                <span className="text-slate-200">{formatRelativeTime(ws.updatedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>ID:</span>
                <span className="font-mono text-slate-300 text-[11px]">{ws.id}</span>
              </div>
              <p className="pt-3 text-xs text-slate-500 leading-relaxed border-t border-slate-800/60">
                {t("workspaces.detail.note")}
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Reports */}
      {activeTab === "reports" && (
        <Card>
          <CardContent className="text-sm text-slate-400">
            <p className="text-slate-500">{t("workspaces.detail.noReports")}</p>
            <p className="mt-2 text-xs text-slate-600">
              Mở Desktop → Publish báo cáo → Chọn "Sync to Cloud" để quản lý tại đây.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Backup */}
      {activeTab === "backup" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm">☁ {t("workspaces.detail.createBackup")}</Button>
            <Button size="sm" variant="outline">📋 {t("workspaces.detail.backupHistory")}</Button>
          </div>
          <Card>
            <CardContent className="text-sm text-slate-400">
              <p className="text-slate-500">{t("workspaces.detail.noBackups")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Activity */}
      {activeTab === "activity" && (
        <Card>
          <CardContent className="text-sm text-slate-400">
            <p className="text-slate-500">{t("workspaces.detail.noActivity")}</p>
            <div className="mt-4 space-y-2 text-xs text-slate-600">
              <p>📄 Nhập tài liệu vào Desktop → log xuất hiện tại đây</p>
              <p>📊 Publish báo cáo → log xuất hiện tại đây</p>
              <p>🧠 Cập nhật sơ đồ tri thức → log xuất hiện tại đây</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members */}
      {activeTab === "members" && (
        <Card>
          <CardContent className="text-sm text-slate-400">
            <p className="text-slate-500">{t("workspaces.detail.noMembers")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  const { id } = useParams();
  const { workspaces, loading } = useWorkspace();
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () => workspaces.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()) || w.id.includes(q)),
    [workspaces, q],
  );

  if (loading) return <Loading />;

  // ── Detail view ──
  if (id) {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return <p className="text-slate-400">{t("workspaces.notFound")}</p>;
    return (
      <div className="space-y-4">
        <Breadcrumb items={[{ label: t("workspaces.title"), to: "/app/workspaces" }, { label: ws.name }]} />
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="page-title">{ws.name}</h2>
          <Badge tone="info">
            {t("workspaces.syncIcons." + ws.syncState) || ""} {ws.syncState}
          </Badge>
        </div>
        {ws.description && (
          <p className="page-subtitle">{ws.description}</p>
        )}
        <WorkspaceDetailTabs ws={ws} />
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">{t("workspaces.title")}</h2>
          <p className="page-subtitle">{t("workspaces.subtitle")}</p>
        </div>
        <SearchBar value={q} onChange={setQ} placeholder={t("workspaces.searchPlaceholder")} />
      </div>
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="mx-auto mb-4 h-10 w-10 text-slate-500" />
            <h2 className="text-xl font-bold text-slate-50">{t("workspaces.empty.title")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              {t("workspaces.empty.description")}
            </p>

            <div className="mx-auto mt-10 max-w-md text-left">
              <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                {t("workspaces.empty.getStarted")}
              </h3>
              <div className="space-y-5">
                {[
                  { step: "step1", icon: Download },
                  { step: "step2", icon: FolderOpen },
                  { step: "step3", icon: BookOpen },
                  { step: "step4", icon: PlayCircle },
                ].map(({ step, icon: Icon }) => (
                  <div key={step} className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-xs font-bold text-sky-400">
                      {step.slice(-1)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        {t(`workspaces.empty.${step}` as any)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t(`workspaces.empty.${step}Desc` as any)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs text-slate-500">
                {t("workspaces.empty.afterSync")}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="sm">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t("workspaces.empty.downloadDesktop")}
              </Button>
              <Button size="sm" variant="outline">
                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                {t("workspaces.empty.docs")}
              </Button>
              <Button size="sm" variant="outline">
                <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                {t("workspaces.empty.tutorial")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => (
            <WorkspaceCard key={w.id} workspace={w} />
          ))}
        </div>
      )}
    </div>
  );
}
