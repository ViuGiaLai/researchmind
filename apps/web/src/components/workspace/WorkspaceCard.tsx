import React from "react";
import { Link } from "react-router-dom";
import type { Workspace, PrivacyLevel } from "@researchmind/types";
import { Badge, Button, Card, CardContent } from "@researchmind/ui";
import { formatRelativeTime, formatBytes } from "@researchmind/utils";
import { t } from "@/i18n";
import { FileText, HardDrive, CheckCircle2, AlertTriangle, CloudOff, RefreshCw, Lock, ExternalLink, Shield } from "lucide-react";

const statusConfig: Record<Workspace["syncState"], { label: string; tone: "success" | "warning" | "danger" | "default" | "info"; icon: React.ReactNode }> = {
  "Synced": { label: t("workspaces.syncStates.Synced"), tone: "success", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  "Syncing": { label: t("workspaces.syncStates.Syncing"), tone: "warning", icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" /> },
  "Local Only": { label: t("workspaces.syncStates.Local Only"), tone: "default", icon: <CloudOff className="h-3.5 w-3.5" /> },
  "Conflict": { label: t("workspaces.syncStates.Conflict"), tone: "danger", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  "Backup Available": { label: t("workspaces.syncStates.Backup Available"), tone: "info", icon: <HardDrive className="h-3.5 w-3.5" /> },
  "Archived": { label: t("workspaces.syncStates.Archived"), tone: "default", icon: <HardDrive className="h-3.5 w-3.5 opacity-50" /> },
};

const privacyNames: Record<PrivacyLevel, string> = {
  local_only: "🔒 " + t("workspaces.privacy.tiers.local_only.name"),
  sync_metadata: "🔄 " + t("workspaces.privacy.tiers.sync_metadata.name"),
  backup_encrypted: "☁️ " + t("workspaces.privacy.tiers.backup_encrypted.name"),
  publish_report: "🌍 " + t("workspaces.privacy.tiers.publish_report.name"),
  team: "👥 " + t("workspaces.privacy.tiers.team.name"),
};

export function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const sync = statusConfig[workspace.syncState] || statusConfig["Synced"];

  return (
    <Link to={`/app/workspaces/${workspace.id}`} className="block transition hover:opacity-90">
      <Card>
        <CardContent className="space-y-3">
          {/* Header: name + badges */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-50">{workspace.name}</h3>
              <Badge tone={sync.tone} className="inline-flex items-center gap-1">
                {sync.icon}
                {sync.label}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              {workspace.encrypted && (
                <Badge tone="info" className="inline-flex items-center gap-1 text-[10px]">
                  <Lock className="h-3 w-3" />
                  {t("workspaces.privacy.encryptedBadge")}
                </Badge>
              )}
            </div>
          </div>

          {/* Description */}
          {workspace.description && (
            <p className="text-sm text-slate-400 line-clamp-2">{workspace.description}</p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">📄 {workspace.paperCount} {t("workspaces.card.papers")}</span>
            <span className="inline-flex items-center gap-1">📊 {workspace.reportCount} {t("workspaces.card.reports")}</span>
            <span className="inline-flex items-center gap-1">🧠 {t("workspaces.card.knowledgeGraph")}</span>
            <span className="inline-flex items-center gap-1">{(workspace.privacyLevel !== "local_only" ? privacyNames[workspace.privacyLevel] : "🔒 " + t("workspaces.privacy.localOnly"))}</span>
          </div>

          {/* Footer: time + actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/60 pt-2">
            <span className="flex items-center gap-2 text-[11px] text-slate-600">
              {t("workspaces.detail.updated")} {formatRelativeTime(workspace.updatedAt)}
              {workspace.storageBytes > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {t("workspaces.privacy.encryptedStorage", { size: formatBytes(workspace.storageBytes) })}
                </span>
              )}
            </span>
            <div className="flex gap-1.5">
              <a
                href={`researchmind://open/workspace/${workspace.id}`}
                onClick={(e) => {
                  // If protocol handler isn't registered, suggest installing Desktop
                  setTimeout(() => window.open("https://researchmind.ai/download", "_blank"), 500);
                }}
              >
                <Button size="sm" variant="ghost" className="h-7 text-xs">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  {t("workspaces.privacy.openInDesktop")}
                </Button>
              </a>
              <Link to={`/app/workspaces/${workspace.id}`} onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="h-7 text-xs">{t("common.view")}</Button>
              </Link>
              <Link to={`/r/${workspace.id}`} onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="h-7 text-xs">
                  <FileText className="mr-1 h-3 w-3" />
                  {t("workspaces.detail.viewReport")}
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
