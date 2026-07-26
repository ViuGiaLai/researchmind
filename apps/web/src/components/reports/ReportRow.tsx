import React from "react";
import { ExternalLink, Monitor, Clock, Tag } from "lucide-react";
import type { Report } from "@researchmind/types";
import { Badge, Button } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";
import { useClipboard } from "@/hooks/useClipboard";
import { t } from "@/i18n";

function visibilityLabel(v: Report["visibility"]): string {
  const map: Record<string, string> = {
    private: t("reports.visibility.private"),
    unlisted: t("reports.visibility.unlisted"),
    shared_link: t("reports.visibility.shared_link"),
    public: t("reports.visibility.public"),
  };
  return map[v] || v;
}

function visibilityTone(v: Report["visibility"]): "default" | "success" | "warning" | "danger" {
  const map: Record<string, "default" | "success" | "warning" | "danger"> = {
    public: "success",
    unlisted: "warning",
    private: "danger",
  };
  return map[v] || "default";
}

function reportTypeLabel(type: string): string {
  const map: Record<string, string> = {
    "Live Report": t("reports.type.live"),
    "Snapshot": t("reports.type.snapshot"),
  };
  return map[type] || type;
}

export function ReportRow({ report }: { report: Report }) {
  const { copied, copy } = useClipboard();
  return (
    <div className="group rounded-xl border border-slate-800 bg-slate-950/50 p-4 transition-colors hover:border-slate-700/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: info */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-50">{report.title}</h3>
            <Badge tone={report.type === "Live Report" ? "success" : "purple"}>{reportTypeLabel(report.type)}</Badge>
            <Badge tone={visibilityTone(report.visibility)}>{visibilityLabel(report.visibility)}</Badge>
          </div>

          {/* Tags */}
          {report.tags && report.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="h-3 w-3 text-slate-600" />
              {report.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-slate-800/60 px-1.5 py-0.5 text-[11px] text-slate-400">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Summary preview */}
          {report.summary && (
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 max-w-lg">
              {report.summary}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
            <span>v{report.version}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t("common.updated")} {formatRelativeTime(report.updatedAt)}
            </span>
            <span className="font-mono text-sky-400/70">{report.url}</span>
            {report.device && (
              <span className="flex items-center gap-1">
                <Monitor className="h-3 w-3" />
                {report.device}
              </span>
            )}
            {report.workspaceName && (
              <span>{report.workspaceName}</span>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => void copy(report.url)}>
            {copied ? t("reports.btn.copied") : t("reports.btn.copy")}
          </Button>
          <a href={report.url} target="_blank" rel="noreferrer">
            <Button size="sm">
              <ExternalLink className="h-3.5 w-3.5" /> {t("reports.btn.open")}
            </Button>
          </a>
          <Button size="sm" variant="ghost" className="text-xs">
            {t("reports.btn.downloadPdf")}
          </Button>
          <Button size="sm" variant="ghost" className="text-xs">
            {t("reports.btn.share")}
          </Button>
        </div>
      </div>
    </div>
  );
}
