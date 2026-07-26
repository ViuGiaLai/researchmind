import React from "react";
import { cn } from "@researchmind/utils";

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition",
            value === t.id ? "bg-slate-800 text-sky-300" : "text-slate-400 hover:text-slate-200",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
