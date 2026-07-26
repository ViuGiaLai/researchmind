import React from "react";
import { initials } from "@/utils/helpers";
import { cn } from "@researchmind/utils";

export function Avatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  if (src) {
    return <img src={src} alt={name} className={cn("h-9 w-9 rounded-full object-cover", className)} />;
  }
  return (
    <div
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-semibold text-white",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
