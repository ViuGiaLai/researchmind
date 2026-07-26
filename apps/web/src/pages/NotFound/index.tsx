import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@researchmind/ui";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="font-display text-6xl font-bold text-slate-700">404</div>
      <h1 className="mt-4 text-2xl font-semibold text-slate-100">Page not found</h1>
      <p className="mt-2 text-slate-400">That route does not exist in ResearchMind Cloud.</p>
      <Link to="/" className="mt-6">
        <Button>Back home</Button>
      </Link>
    </div>
  );
}
