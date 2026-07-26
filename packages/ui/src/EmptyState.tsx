import type { ReactNode } from "react";
import { cn } from "@researchmind/utils";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-4 text-slate-500">{icon}</div> : null}
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
