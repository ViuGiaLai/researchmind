import React from "react";
import type { BackupRecord } from "@researchmind/types";
import { Badge, Button } from "@researchmind/ui";
import { Download } from "lucide-react";
import { formatBytes, formatRelativeTime } from "@researchmind/utils";
import { t } from "@/i18n";

function statusLabel(status: BackupRecord["status"]): string {
  const map: Record<string, string> = {
    completed: t("backups.status.completed"),
    pending: t("backups.status.pending"),
    failed: t("backups.status.failed"),
    restoring: t("backups.status.restoring"),
  };
  return map[status] || status;
}

function typeLabel(type: BackupRecord["type"]): string {
  const map: Record<string, string> = {
    workspace: t("backups.type.workspace"),
    settings: t("backups.type.settings"),
    prompts: t("backups.type.prompts"),
    full: t("backups.type.full"),
  };
  return map[type] || type;
}

export function BackupList({
  items,
  onRestore,
}: {
  items: BackupRecord[];
  onRestore?: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((b) => (
        <div key={b.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-100">{b.name}</h3>
              <Badge tone={b.status === "completed" ? "success" : b.status === "failed" ? "danger" : "warning"}>
                {statusLabel(b.status)}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {typeLabel(b.type)} · {formatBytes(b.sizeBytes)} · {formatRelativeTime(b.createdAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost">
              <Download className="h-3.5 w-3.5" /> {t("backups.btn.download")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onRestore?.(b.id)}>
              {t("backups.btn.restore")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
