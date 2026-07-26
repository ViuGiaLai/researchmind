import React from "react";
import { Card, CardContent } from "@researchmind/ui";

export function StatCard({
  label,
  value,
  sub,
  color = "#38bdf8",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent>
        <div className="text-sm text-slate-400">{label}</div>
        <div className="mt-2 font-display text-3xl font-bold" style={{ color }}>
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
