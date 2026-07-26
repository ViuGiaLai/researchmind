import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-slate-500">
      {items.map((item, i) => (
        <React.Fragment key={item.label + i}>
          {i > 0 ? <ChevronRight className="h-3.5 w-3.5" /> : null}
          {item.to ? (
            <Link to={item.to} className="hover:text-sky-300">
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-300">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
