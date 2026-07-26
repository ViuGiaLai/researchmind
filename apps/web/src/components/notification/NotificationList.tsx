import React from "react";
import { Link } from "react-router-dom";
import type { NotificationItem } from "@researchmind/types";
import { Badge } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";

export function NotificationList({ items }: { items: NotificationItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((n) => {
        const body = (
          <div className={`rounded-xl border p-4 ${n.read ? "border-slate-800 bg-slate-950/30" : "border-sky-500/20 bg-sky-500/5"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-slate-100">{n.title}</div>
                <div className="mt-1 text-sm text-slate-400">{n.body}</div>
                <div className="mt-2 text-xs text-slate-500">{formatRelativeTime(n.createdAt)}</div>
              </div>
              <Badge tone={n.read ? "default" : "info"}>{n.kind}</Badge>
            </div>
          </div>
        );
        return n.href ? (
          <Link key={n.id} to={n.href}>
            {body}
          </Link>
        ) : (
          <div key={n.id}>{body}</div>
        );
      })}
    </div>
  );
}
