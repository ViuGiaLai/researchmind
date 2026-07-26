import React, { useEffect, useRef, useState } from "react";

export function Dropdown({
  trigger,
  items,
}: {
  trigger: React.ReactNode;
  items: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex">
        {trigger}
      </button>
      {open ? (
        <div
          className="absolute right-0 z-30 mt-2 min-w-[180px] rounded-xl border py-1 shadow-xl"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm transition ${
                item.danger
                  ? "text-rose-500 hover:bg-rose-500/10 dark:text-rose-400"
                  : "text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
