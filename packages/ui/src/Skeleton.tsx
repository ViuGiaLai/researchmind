import { cn } from "@researchmind/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-800/80", className)} />;
}
