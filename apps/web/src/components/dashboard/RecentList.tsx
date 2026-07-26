import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@researchmind/ui";

export function RecentList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon?: React.ReactNode;
  items: { id: string; title: string; subtitle?: string; badge?: string; href?: string }[];
  empty?: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!items.length ? (
          <p className="text-sm text-slate-500">{empty || "Nothing here yet."}</p>
        ) : (
          items.map((item) => {
            const body = (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                  {item.subtitle ? <div className="mt-0.5 text-xs text-slate-500">{item.subtitle}</div> : null}
                </div>
                {item.badge ? <Badge tone="info">{item.badge}</Badge> : null}
              </div>
            );
            return item.href ? (
              <Link key={item.id} to={item.href} className="block transition hover:opacity-90">
                {body}
              </Link>
            ) : (
              <div key={item.id}>{body}</div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
