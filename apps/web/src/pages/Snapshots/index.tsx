import React, { useEffect, useState, useCallback, useMemo } from "react";
import type { Snapshot, SnapshotTag } from "@researchmind/types";
import { listSnapshots } from "@/services/snapshots";
import { Loading } from "@/components/common/Loading";
import { Badge, Button, Card, CardContent, EmptyState } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";
import { t, tpl } from "@/i18n";
import {
  GitBranch, GitCommit, Eye, ArrowLeftRight, RotateCcw,
  DownloadIcon, Camera, X, Search, Monitor, Hash, FileText,
  Tag, Circle, ChevronRight, Clock, Calendar
} from "lucide-react";

// ─── Helpers ───
function getTagColors(tag?: SnapshotTag): string {
  switch (tag) {
    case "draft": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "milestone": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    case "published": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "archived": return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    default: return "";
  }
}

type TimeBucket = "today" | "yesterday" | "thisWeek" | "older";

function getTimeBucket(dateStr: string): TimeBucket {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const daysDiff = Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86400000);
  if (daysDiff === 0) return "today";
  if (daysDiff === 1) return "yesterday";
  if (daysDiff <= 7) return "thisWeek";
  return "older";
}

const BUCKET_ORDER: TimeBucket[] = ["today", "yesterday", "thisWeek", "older"];

// ─── Preview Dialog ───
function PreviewDialog({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="mx-4 w-full max-w-xl max-h-[85vh] overflow-y-auto">
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-100">{t("snapshots.preview.title")}</h3>
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Title line */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={snapshot.snapshotType === "manual" ? "purple" : "info"}>
              {tpl("snapshots.versionLabel", { version: snapshot.version })}
            </Badge>
            <Badge tone={snapshot.snapshotType === "manual" ? "warning" : "default"} className="text-[10px]">
              {snapshot.snapshotType === "manual" ? t("snapshots.types.manual") : t("snapshots.types.auto")}
            </Badge>
            {snapshot.tag && (
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${getTagColors(snapshot.tag)}`}>
                {t(`snapshots.tags.${snapshot.tag}`)}
              </span>
            )}
            <span className="text-sm text-slate-300 truncate">{snapshot.title}</span>
          </div>

          {/* Metadata grid */}
          <div>
            <h4 className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("snapshots.preview.metadata")}</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="text-slate-500">{t("snapshots.preview.version")}</div>
              <div className="text-slate-200">{snapshot.version}</div>
              <div className="text-slate-500">{t("snapshots.preview.type")}</div>
              <div className="text-slate-200">{snapshot.snapshotType === "manual" ? t("snapshots.types.manual") : t("snapshots.types.auto")}</div>
              <div className="text-slate-500">{t("snapshots.preview.creator")}</div>
              <div className="text-slate-200">{snapshot.creator}</div>
              <div className="text-slate-500">{t("snapshots.preview.created")}</div>
              <div className="text-slate-200">{new Date(snapshot.createdAt).toLocaleString()}</div>
              <div className="text-slate-500">{t("snapshots.preview.device")}</div>
              <div className="text-slate-200">{snapshot.device || "—"}</div>
              <div className="text-slate-500">{t("snapshots.preview.hash")}</div>
              <div className="text-slate-200 font-mono text-[11px]">{snapshot.hash || "—"}</div>
              <div className="text-slate-500">{t("snapshots.preview.workspace")}</div>
              <div className="text-slate-200">{snapshot.workspaceName || snapshot.workspaceId || "—"}</div>
            </div>
          </div>

          {/* AI Summary */}
          {snapshot.summary && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <h4 className="mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("snapshots.preview.summary")}</h4>
              <p className="text-sm text-slate-300 leading-relaxed">{snapshot.summary}</p>
            </div>
          )}

          {/* Note */}
          {snapshot.note && (
            <div>
              <h4 className="mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("snapshots.preview.note")}</h4>
              <p className="text-sm text-slate-400">{snapshot.note}</p>
            </div>
          )}

          {/* Changes */}
          {snapshot.changes && snapshot.changes.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("snapshots.preview.changes")}</h4>
              <ul className="space-y-1">
                {snapshot.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-emerald-300">
                    <span className="mt-0.5 text-emerald-400">+</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={onClose}>{t("snapshots.preview.close")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Compare Dialog ───
function CompareDialog({ from, to, onClose }: { from: Snapshot; to: Snapshot | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="mx-4 w-full max-w-lg">
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-100">{t("snapshots.compare.title")}</h3>
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Badge tone="purple">{t("snapshots.compare.from")}: {tpl("snapshots.versionLabel", { version: from.version })}</Badge>
            <span className="text-slate-500">→</span>
            <Badge tone="info">{t("snapshots.compare.to")}: {tpl("snapshots.versionLabel", { version: to?.version ?? 0 })}</Badge>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h4 className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wider">{t("snapshots.compare.changes")}</h4>
            {to?.changes && to.changes.length > 0 ? (
              <ul className="space-y-1.5">
                {to.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-emerald-300">
                    <span className="mt-0.5 text-emerald-400">+</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("snapshots.compare.noChanges")}</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={onClose}>{t("snapshots.compare.close")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Restore Confirm Dialog ───
function RestoreConfirm({ snapshot, onConfirm, onCancel }: { snapshot: Snapshot; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="mx-4 w-full max-w-md">
        <CardContent className="space-y-4">
          <h3 className="text-base font-semibold text-slate-100">{t("snapshots.restoreConfirm.title")}</h3>
          <p className="text-sm text-slate-400">{t("snapshots.restoreConfirm.description")}</p>
          <p className="text-sm text-slate-300 font-medium">
            {tpl("snapshots.versionLabel", { version: snapshot.version })} · {snapshot.title}
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onCancel}>{t("snapshots.restoreConfirm.cancel")}</Button>
            <Button size="sm" onClick={onConfirm}>{t("snapshots.restoreConfirm.confirm")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Snapshot Timeline Card ───
function TimelineCard({
  snapshot,
  isLatest,
  onCompare,
  onRestore,
  onPreview,
}: {
  snapshot: Snapshot;
  isLatest: boolean;
  onCompare: (s: Snapshot) => void;
  onRestore: (s: Snapshot) => void;
  onPreview: (s: Snapshot) => void;
}) {
  return (
    <div className="group relative flex gap-4">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        {isLatest ? (
          <div className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
        ) : (
          <div className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 ring-1 ring-slate-700">
            <Circle className="h-2.5 w-2.5 fill-slate-500 text-slate-500" />
          </div>
        )}
        <div className="mt-0.5 w-px flex-1 bg-gradient-to-b from-slate-700/60 to-slate-800/20" />
      </div>

      {/* Card */}
      <div className="mb-4 flex-1">
        <Card className="transition-all duration-200 group-hover:border-slate-700/80">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-2">
              {/* Left info */}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={snapshot.snapshotType === "manual" ? "purple" : "info"} className="shrink-0">
                    {tpl("snapshots.versionLabel", { version: snapshot.version })}
                  </Badge>
                  <Badge tone={snapshot.snapshotType === "manual" ? "warning" : "default"} className="shrink-0 text-[10px]">
                    {snapshot.snapshotType === "manual" ? t("snapshots.types.manual") : t("snapshots.types.auto")}
                  </Badge>
                  {snapshot.tag && (
                    <span className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${getTagColors(snapshot.tag)}`}>
                      {t(`snapshots.tags.${snapshot.tag}`)}
                    </span>
                  )}
                </div>

                <p className="text-sm font-medium text-slate-200 leading-snug truncate max-w-md">
                  {snapshot.title}
                </p>

                {/* AI Summary snippet */}
                {snapshot.summary && (
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 max-w-lg">
                    {snapshot.summary}
                  </p>
                )}

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(snapshot.createdAt)}
                  </span>
                  <span>{snapshot.creator}</span>
                  {snapshot.device && (
                    <span className="flex items-center gap-1">
                      <Monitor className="h-3 w-3" />
                      {snapshot.device}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onPreview(snapshot)}
                >
                  <FileText className="mr-1 h-3 w-3" />
                  {t("snapshots.actions.view")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onCompare(snapshot)}
                >
                  <ArrowLeftRight className="mr-1 h-3 w-3" />
                  {t("snapshots.actions.compare")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onRestore(snapshot)}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  {t("snapshots.actions.restore")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function SnapshotsPage() {
  const [items, setItems] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "auto" | "manual">("all");
  const [tagFilter, setTagFilter] = useState<"all" | SnapshotTag>("all");
  const [previewTarget, setPreviewTarget] = useState<Snapshot | null>(null);
  const [compareFrom, setCompareFrom] = useState<Snapshot | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Snapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSnapshots();
      setItems(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRestore = useCallback(async () => {
    if (!restoreTarget) return;
    setRestoreTarget(null);
  }, [restoreTarget]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = [...items];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.workspaceName || "").toLowerCase().includes(q) ||
          s.creator.toLowerCase().includes(q),
      );
    }

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((s) => s.snapshotType === typeFilter);
    }

    // Tag filter
    if (tagFilter !== "all") {
      result = result.filter((s) => s.tag === tagFilter);
    }

    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, search, typeFilter, tagFilter]);

  // Group by time bucket
  const timeline = useMemo(() => {
    const buckets = new Map<TimeBucket, Snapshot[]>();
    for (const s of filtered) {
      const b = getTimeBucket(s.createdAt);
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b)!.push(s);
    }
    return BUCKET_ORDER.filter((b) => buckets.has(b)).map((b) => ({ bucket: b, items: buckets.get(b)! }));
  }, [filtered]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">{t("snapshots.title")}</h2>
          <p className="page-subtitle">{t("snapshots.subtitle")}</p>
        </div>
        <Button size="sm">
          <Camera className="mr-1.5 h-3.5 w-3.5" />
          {t("snapshots.empty.action")}
        </Button>
      </div>

      {/* Search + Filters */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("snapshots.search")}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 outline-none transition-colors focus:border-slate-700"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | "auto" | "manual")}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300 outline-none transition-colors focus:border-slate-700"
          >
            <option value="all">{t("snapshots.filter.all")}</option>
            <option value="auto">{t("snapshots.filter.auto")}</option>
            <option value="manual">{t("snapshots.filter.manual")}</option>
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value as "all" | SnapshotTag)}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300 outline-none transition-colors focus:border-slate-700"
          >
            <option value="all">{t("snapshots.tags.all")}</option>
            <option value="draft">{t("snapshots.tags.draft")}</option>
            <option value="milestone">{t("snapshots.tags.milestone")}</option>
            <option value="published">{t("snapshots.tags.published")}</option>
            <option value="archived">{t("snapshots.tags.archived")}</option>
          </select>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="h-8 w-8" />}
          title={t("snapshots.empty.title")}
          description={t("snapshots.empty.description")}
          action={
            <div className="w-full max-w-sm space-y-3">
              <div className="space-y-1 text-left text-sm text-slate-500">
                <p className="font-medium text-slate-400">{t("snapshots.empty.reasons")}</p>
                <p>{t("snapshots.empty.reason1")}</p>
                <p>{t("snapshots.empty.reason2")}</p>
                <p>{t("snapshots.empty.reason3")}</p>
                <p>{t("snapshots.empty.reason4")}</p>
              </div>
              <div className="flex justify-center">
                <Button size="sm">
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                  {t("snapshots.empty.action")}
                </Button>
              </div>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="mb-3 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-500">{t("common.noData")}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {timeline.map(({ bucket, items: bucketItems }) => (
            <div key={bucket}>
              {/* Timeline section header */}
              <div className="mb-2 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t(`snapshots.timeline.${bucket}`)}
                </h3>
                <span className="text-[11px] text-slate-700">{bucketItems.length}</span>
              </div>

              {/* Timeline cards */}
              <div className="ml-0.5">
                {bucketItems.map((s, idx) => (
                  <TimelineCard
                    key={s.id}
                    snapshot={s}
                    isLatest={idx === 0 && bucket === "today"}
                    onCompare={setCompareFrom}
                    onRestore={setRestoreTarget}
                    onPreview={setPreviewTarget}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview dialog */}
      {previewTarget && (
        <PreviewDialog
          snapshot={previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* Compare dialog */}
      {compareFrom && (
        <CompareDialog
          from={compareFrom}
          to={items.length > 1 ? items.sort((a, b) => b.version - a.version)[0] : null}
          onClose={() => setCompareFrom(null)}
        />
      )}

      {/* Restore confirm */}
      {restoreTarget && (
        <RestoreConfirm
          snapshot={restoreTarget}
          onConfirm={handleRestore}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
}
