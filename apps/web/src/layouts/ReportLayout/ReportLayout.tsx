import React from "react";
import { Link, Outlet } from "react-router-dom";
import { BrandLogo } from "@/components/common/BrandLogo";

export function ReportLayout() {
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <BrandLogo size={28} />
            ResearchMind Report
          </Link>
          <Link to="/app/reports" className="text-sm text-sky-400 hover:text-sky-300">
            Manage reports
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
