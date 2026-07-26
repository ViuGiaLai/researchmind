import React from "react";
import { Link, Outlet } from "react-router-dom";
import { BrandLogo } from "@/components/common/BrandLogo";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8 flex items-center gap-2">
        <BrandLogo size={36} />
        <span className="font-display text-xl font-bold">ResearchMind Cloud</span>
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
        <Outlet />
      </div>
    </div>
  );
}
