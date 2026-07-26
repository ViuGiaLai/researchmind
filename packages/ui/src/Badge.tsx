import type { ReactNode } from "react";
import { cn } from "@researchmind/utils";

export type BadgeTone = "default" | "success" | "warning" | "danger" | "info" | "purple";

const tones: Record<BadgeTone, string> = {
  default: "bg-slate-800 text-slate-300 border-slate-700",
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  danger: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  purple: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children?: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
