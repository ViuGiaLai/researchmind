import { cn } from "@researchmind/utils";

export function LoadingSpinner({
  className,
  label = "Loading…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500/20 border-t-sky-400" />
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}
