import React from "react";

const entries = [
  { version: "1.0.0", date: "2026-07-25", notes: ["Cloud web monorepo scaffold", "Dashboard, workspaces, reports MVP", "Shared packages for Desktop + Web"] },
  { version: "0.6.0", date: "2026-06-01", notes: ["Desktop local-first release", "Cloud Free gateway", "Public report routes"] },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="page-title">Changelog</h1>
      <div className="mt-8 space-y-8">
        {entries.map((e) => (
          <div key={e.version} className="border-l-2 border-sky-500/40 pl-4">
            <div className="font-semibold text-slate-50">v{e.version}</div>
            <div className="text-xs text-slate-500">{e.date}</div>
            <ul className="mt-2 space-y-1 text-sm text-slate-400">
              {e.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
