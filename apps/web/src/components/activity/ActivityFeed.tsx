import React, { useState } from "react";
import type { ActivityItem, ActivityCategory } from "@researchmind/types";
import { t } from "@/i18n";
import { ChevronDown, ChevronRight } from "lucide-react";

// Order for day-group sorting (based on actual timestamps, not translated labels)
function dayOrder(dayLabel: string): number {
  if (dayLabel.startsWith("Today")) return 0;
  if (dayLabel.startsWith("Hôm nay")) return 0;
  if (dayLabel.startsWith("Yesterday")) return 1;
  if (dayLabel.startsWith("Hôm qua")) return 1;
  return 2; // all other days
}

const catIcons: Record<ActivityCategory, string> = {
  research: "📚",
  ai: "🤖",
  reports: "📄",
  cloud: "☁️",
  team: "👥",
  security: "🔐",
};

const catStyles: Record<ActivityCategory, string> = {
  research: "border-l-emerald-500",
  ai: "border-l-violet-500",
  reports: "border-l-sky-500",
  cloud: "border-l-amber-500",
  team: "border-l-rose-500",
  security: "border-l-slate-500",
};

function groupByDay(items: ActivityItem[]): Map<string, ActivityItem[]> {
  const groups = new Map<string, ActivityItem[]>();
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();

  for (const item of items) {
    const d = new Date(item.timestamp);
    const dayStr = d.toDateString();
    let label: string;
    if (dayStr === todayStr) label = t("activity.time.today");
    else if (dayStr === yesterdayStr) label = t("activity.time.yesterday");
    else label = t("activity.time.daysAgo", { days: Math.floor((now.getTime() - d.getTime()) / 86400000) });

    const existing = groups.get(label);
    if (existing) existing.push(item);
    else groups.set(label, [item]);
  }
  return groups;
}

function ActivityCard({ item, isLast }: { item: ActivityItem; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const cat = item.category || "research";
  const time = new Date(item.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="relative pl-8">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-800" />
      )}
      {/* Dot */}
      <div className={`absolute left-[5px] top-[6px] h-3 w-3 rounded-full border-2 border-slate-700 bg-slate-950 ${catStyles[cat] || "border-l-slate-500"}`} />
      {/* Content */}
      <div
        className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-3 hover:border-slate-700/60 transition cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">{catIcons[cat] || "📌"}</span>
            <span className="text-sm font-medium text-slate-100">{item.title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-600">{timeStr}</span>
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
          </div>
        </div>
        {item.detail && (
          <p className="mt-1 text-xs text-slate-400 line-clamp-2">{item.detail}</p>
        )}
        {item.workspaceName && (
          <p className="mt-0.5 text-[11px] text-slate-600">{t("activity.detail.workspace")}: {item.workspaceName}</p>
        )}
        {/* Expanded detail */}
        {expanded && item.metadata && Object.keys(item.metadata).length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-800/40 space-y-1">
            {Object.entries(item.metadata).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 capitalize">{key.replace(/_/g, " ")}:</span>
                <span className="text-slate-300 font-medium">{String(val)}</span>
              </div>
            ))}
          </div>
        )}
        {item.actorName && (
          <div className="mt-1.5 text-[10px] text-slate-600">
            {t("activity.detail.actor")}: {item.actorName}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const groups = groupByDay(items);
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
    const oa = dayOrder(a[0]);
    const ob = dayOrder(b[0]);
    if (oa !== ob) return oa - ob;
    // Same relative day — sort by most recent activity timestamp
    const aMax = Math.max(...a[1].map((x) => new Date(x.timestamp).getTime()));
    const bMax = Math.max(...b[1].map((x) => new Date(x.timestamp).getTime()));
    return bMax - aMax;
  });

  return (
    <div className="space-y-6">
      {sortedGroups.map(([label, acts]) => (
        <div key={label}>
          <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</h3>
          <div className="space-y-1">
            {acts.map((act, idx) => (
              <ActivityCard key={act.id} item={act} isLast={idx === acts.length - 1} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
