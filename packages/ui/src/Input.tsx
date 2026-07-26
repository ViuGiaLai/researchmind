import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@researchmind/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id || (props.name as string | undefined);
  return (
    <label className="flex w-full flex-col gap-1.5 text-sm">
      {label ? <span className="font-medium text-slate-300">{label}</span> : null}
      <input
        id={inputId}
        className={cn(
          "h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20",
          error && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20",
          className,
        )}
        {...props}
      />
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
      {!error && hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
