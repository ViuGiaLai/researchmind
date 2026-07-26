import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Report } from "@researchmind/types";
import { getReport } from "@/services/reports";
import { Loading } from "@/components/common/Loading";
import { Badge, Button, Card, CardContent } from "@researchmind/ui";
import { formatDate, formatRelativeTime } from "@researchmind/utils";
import { useClipboard } from "@/hooks/useClipboard";
import { t, tpl } from "@/i18n";
import {
  ExternalLink, ArrowLeft, Clock, Monitor, Tag, BookOpen,
  FileText, Download, Share2, Copy, Trash2, Layers, User, Hash
} from "lucide-react";

function visibilityTone(v: Report["visibility"]): "default" | "success" | "warning" | "danger" {
  const map: Record<string, "default" | "success" | "warning" | "danger"> = {
    public: "success",
    unlisted: "warning",
    private: "danger",
  };
  return map[v] || "default";
}

function estimateReadTime(text?: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export default function ReportViewerPage() {
  const { id } = useParams();
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const { copied, copy } = useClipboard();

  useEffect(() => {
    if (!id) return;
    setReport(undefined);
    setError(null);
    getReport(id)
      .then((r) => setReport(r || null))
      .catch((err: any) => {
        const status = err?.status || err?.code || 0;
        setError({ status, message: err?.message || String(err) });
        setReport(null);
      });
  }, [id]);

  if (report === undefined && !error) return <Loading label="Loading report…" />;

  // Error state
  if (error || !report) {
    const is403 = error?.status === 403;
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center max-w-md">
          <FileText className="mx-auto mb-4 h-10 w-10 text-slate-600" />
          <h1 className="text-lg font-semibold text-slate-100">
            {is403 ? "Private report" : t("reports.detail.notFound")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {is403
              ? "This report is private. Sign in to view it."
              : tpl("reports.detail.notFoundDesc", { id: id || "" })}
          </p>
          <Link to="/app/reports">
            <Button size="sm" variant="secondary" className="mt-4">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to reports
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const readTime = estimateReadTime(report.summary);

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        to="/app/reports"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to reports
      </Link>

      {/* ─── Header ──────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title mb-0">{report.title}</h1>
          <Badge tone={report.type === "Live Report" ? "success" : "purple"}>{report.type}</Badge>
          <Badge tone={visibilityTone(report.visibility)}>
            {report.visibility === "public" ? t("reports.visibility.public")
              : report.visibility === "unlisted" ? t("reports.visibility.unlisted")
              : t("reports.visibility.private")}
          </Badge>
        </div>

        {/* Authors */}
        {report.authors && report.authors.length > 0 && (
          <p className="mt-2 text-sm text-slate-400">
            {report.authors.join(", ")}
          </p>
        )}

        {/* Meta line */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>v{report.version}</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {t("common.updated")} {formatDate(report.updatedAt)}
          </span>
          {readTime > 0 && (
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              {tpl("reports.detail.minRead", { min: readTime })}
            </span>
          )}
          {report.device && (
            <span className="flex items-center gap-1">
              <Monitor className="h-3 w-3" />
              {report.device}
            </span>
          )}
        </div>
      </div>

      {/* ─── Actions ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void copy(report.url)}>
          {copied ? t("reports.btn.copied") : <><Copy className="mr-1.5 h-3.5 w-3.5" />{t("reports.btn.copy")}</>}
        </Button>
        <Button size="sm" variant="ghost">
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {t("reports.btn.downloadPdf")}
        </Button>
        <Button size="sm" variant="ghost">
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {t("reports.btn.downloadDocx")}
        </Button>
        <Button size="sm" variant="ghost">
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          {t("reports.btn.exportHtml")}
        </Button>
        <Button size="sm" variant="ghost">
          <Share2 className="mr-1.5 h-3.5 w-3.5" />
          {t("reports.btn.share")}
        </Button>
        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {t("reports.btn.delete")}
        </Button>
      </div>

      {/* ─── Abstract ────────────────────────────────── */}
      {report.summary && (
        <Card>
          <CardContent>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("reports.detail.abstract")}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">{report.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* ─── Report body ─────────────────────────────── */}
      <Card>
        <CardContent>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("reports.detail.body")}
          </h2>
          {report.contentHtml ? (
            <div
              className="prose prose-invert max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: report.contentHtml }}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-10 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-slate-600" />
              <p className="text-sm text-slate-500">{t("reports.detail.bodyEmpty")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Two-column: Metadata + Version history ──── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Metadata */}
        <Card className="lg:col-span-2">
          <CardContent>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("reports.detail.metadata")}
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <span className="text-slate-500">{t("reports.detail.version")}</span>
              <span className="text-slate-200">{report.version}</span>

              <span className="text-slate-500">{t("reports.detail.workspace")}</span>
              <span className="text-slate-200 font-mono text-xs">{report.workspaceName || report.workspaceId}</span>

              <span className="text-slate-500">{t("reports.detail.visibility")}</span>
              <span className="text-slate-200">
                {report.visibility === "public" ? t("reports.visibility.public")
                  : report.visibility === "unlisted" ? t("reports.visibility.unlisted")
                  : t("reports.visibility.private")}
              </span>

              {report.publishedBy && (
                <>
                  <span className="text-slate-500">{t("reports.detail.publishedBy")}</span>
                  <span className="text-slate-200">{report.publishedBy}</span>
                </>
              )}

              {report.authors && report.authors.length > 0 && (
                <>
                  <span className="text-slate-500">{t("reports.detail.authors")}</span>
                  <span className="text-slate-200">{report.authors.join(", ")}</span>
                </>
              )}

              <span className="text-slate-500">{t("reports.detail.created")}</span>
              <span className="text-slate-200">{formatDate(report.createdAt)}</span>

              <span className="text-slate-500">{t("reports.detail.updated")}</span>
              <span className="text-slate-200">{formatDate(report.updatedAt)}</span>

              {report.device && (
                <>
                  <span className="text-slate-500">{t("reports.detail.device")}</span>
                  <span className="text-slate-200">{report.device}</span>
                </>
              )}

              {report.aiModel && (
                <>
                  <span className="text-slate-500">{t("reports.detail.aiModel")}</span>
                  <span className="text-slate-200">{report.aiModel}</span>
                </>
              )}

              {report.wordCount !== undefined && (
                <>
                  <span className="text-slate-500">{t("reports.detail.wordCount")}</span>
                  <span className="text-slate-200">{report.wordCount.toLocaleString()}</span>
                </>
              )}

              {report.citationCount !== undefined && (
                <>
                  <span className="text-slate-500">{t("reports.detail.citations")}</span>
                  <span className="text-slate-200">{report.citationCount}</span>
                </>
              )}

              {report.doi && (
                <>
                  <span className="text-slate-500">{t("reports.detail.doi")}</span>
                  <span className="text-sky-400 text-xs">
                    <a href={`https://doi.org/${report.doi}`} target="_blank" rel="noreferrer">{report.doi}</a>
                  </span>
                </>
              )}
            </div>

            {/* Tags */}
            {report.tags && report.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-800/40 pt-3">
                <Tag className="h-3 w-3 text-slate-600" />
                {report.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-slate-800/60 px-1.5 py-0.5 text-[11px] text-slate-400">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Version history sidebar */}
        <Card>
          <CardContent>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("reports.detail.versions")}
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>
                <div className="text-sm text-slate-200">
                  {tpl("reports.detail.versionLabel", { version: report.version })}
                  <span className="ml-2 text-[11px] text-slate-500">
                    {formatRelativeTime(report.updatedAt)}
                  </span>
                </div>
              </div>
              {report.version > 1 ? (
                Array.from({ length: report.version - 1 }, (_, i) => report.version! - 1 - i).map((v) => (
                  <div key={v} className="flex items-center gap-2.5 opacity-60">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800">
                      <div className="h-2 w-2 rounded-full bg-slate-600" />
                    </div>
                    <div className="text-sm text-slate-400">
                      {tpl("reports.detail.versionLabel", { version: v })}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-600">{t("reports.detail.noVersions")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
