/**
 * Part 3: components, layouts, features, pages, routes, app entry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(__dirname, "..", "apps", "web");

function write(rel, content) {
  const full = path.join(web, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r?\n/g, "\n"), "utf8");
  console.log("write", rel);
}

// common components (re-export shared + local wrappers)
write("src/components/common/Button/Button.tsx", `export { Button } from "@researchmind/ui";
export type { ButtonProps, ButtonVariant, ButtonSize } from "@researchmind/ui/src/Button";
`);
// Fix - packages/ui doesn't export types from path like that. Better re-export simply:
write("src/components/common/Button/Button.tsx", `export { Button } from "@researchmind/ui";
`);
write("src/components/common/Button/index.ts", `export { Button } from "./Button";
`);

write("src/components/common/Card/Card.tsx", `export { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@researchmind/ui";
`);
write("src/components/common/Card/index.ts", `export * from "./Card";
`);

write("src/components/common/Badge/Badge.tsx", `export { Badge } from "@researchmind/ui";
`);
write("src/components/common/Badge/index.ts", `export * from "./Badge";
`);

write("src/components/common/Modal/Modal.tsx", `export { Modal } from "@researchmind/ui";
`);
write("src/components/common/Modal/index.ts", `export * from "./Modal";
`);

write("src/components/common/Dialog/Dialog.tsx", `export { Modal as Dialog } from "@researchmind/ui";
`);
write("src/components/common/Dialog/index.ts", `export * from "./Dialog";
`);

write("src/components/common/Table/Table.tsx", `import React from "react";
import { cn } from "@researchmind/utils";

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border border-slate-800", className)}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-slate-950/80 text-xs uppercase tracking-wide text-slate-500">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-800">{children}</tbody>;
}

export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("hover:bg-slate-900/60", className)}>{children}</tr>;
}

export function TH({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 font-medium", className)}>{children}</th>;
}

export function TD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 text-slate-300", className)}>{children}</td>;
}
`);
write("src/components/common/Table/index.ts", `export * from "./Table";
`);

write("src/components/common/Tabs/Tabs.tsx", `import React from "react";
import { cn } from "@researchmind/utils";

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition",
            value === t.id ? "bg-slate-800 text-sky-300" : "text-slate-400 hover:text-slate-200",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
`);
write("src/components/common/Tabs/index.ts", `export * from "./Tabs";
`);

write("src/components/common/Avatar/Avatar.tsx", `import React from "react";
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
`);
write("src/components/common/Avatar/index.ts", `export * from "./Avatar";
`);

write("src/components/common/Tooltip/Tooltip.tsx", `import React from "react";

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-100 shadow group-hover:block">
        {label}
      </span>
    </span>
  );
}
`);
write("src/components/common/Tooltip/index.ts", `export * from "./Tooltip";
`);

write("src/components/common/Dropdown/Dropdown.tsx", `import React, { useEffect, useRef, useState } from "react";

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
        <div className="absolute right-0 z-30 mt-2 min-w-[180px] rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={\`block w-full px-3 py-2 text-left text-sm \${item.danger ? "text-rose-400 hover:bg-rose-500/10" : "text-slate-200 hover:bg-slate-800"}\`}
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
`);
write("src/components/common/Dropdown/index.ts", `export * from "./Dropdown";
`);

write("src/components/common/EmptyState/EmptyState.tsx", `export { EmptyState } from "@researchmind/ui";
`);
write("src/components/common/EmptyState/index.ts", `export * from "./EmptyState";
`);

write("src/components/common/Loading/Loading.tsx", `export { LoadingSpinner as Loading } from "@researchmind/ui";
`);
write("src/components/common/Loading/index.ts", `export * from "./Loading";
`);

write("src/components/common/Skeleton/Skeleton.tsx", `export { Skeleton } from "@researchmind/ui";
`);
write("src/components/common/Skeleton/index.ts", `export * from "./Skeleton";
`);

write("src/components/common/Pagination/Pagination.tsx", `import React from "react";
import { Button } from "@researchmind/ui";

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
      <span>
        Page {page} of {pages} · {total} items
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
`);
write("src/components/common/Pagination/index.ts", `export * from "./Pagination";
`);

write("src/components/common/SearchBar/SearchBar.tsx", `import React from "react";
import { Search } from "lucide-react";

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="relative block w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
      />
    </label>
  );
}
`);
write("src/components/common/SearchBar/index.ts", `export * from "./SearchBar";
`);

// navigation
write("src/components/navigation/Sidebar/Sidebar.tsx", `import React from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  Cloud,
  CreditCard,
  Database,
  FileText,
  HelpCircle,
  KeyRound,
  Layers,
  MessageSquare,
  Settings,
  Smartphone,
  Users,
  Camera,
} from "lucide-react";
import { cn } from "@researchmind/utils";

const items = [
  { to: "/app", label: "Dashboard", icon: Layers, end: true },
  { to: "/app/workspaces", label: "Workspaces", icon: Cloud },
  { to: "/app/reports", label: "Reports", icon: FileText },
  { to: "/app/snapshots", label: "Snapshots", icon: Camera },
  { to: "/app/activity", label: "Activity", icon: Activity },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/app/backups", label: "Backups", icon: Database },
  { to: "/app/devices", label: "Devices", icon: Smartphone },
  { to: "/app/team", label: "Team", icon: Users },
  { to: "/app/billing", label: "Billing", icon: CreditCard },
  { to: "/app/api-keys", label: "API Keys", icon: KeyRound },
  { to: "/app/settings", label: "Settings", icon: Settings },
  { to: "/app/help", label: "Help", icon: HelpCircle },
  { to: "/app/feedback", label: "Feedback", icon: MessageSquare },
];

export function Sidebar() {
  return (
    <aside className="hidden w-[260px] shrink-0 border-r border-slate-800 bg-slate-950/60 lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
        <img src="/logo.svg" alt="" className="h-8 w-8" />
        <div>
          <div className="font-display text-sm font-bold text-slate-50">ResearchMind</div>
          <div className="text-[10px] uppercase tracking-wider text-sky-400">Cloud</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-slate-800 text-sky-300"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-4 text-xs text-slate-500">
        Desktop is the research IDE · Cloud is collaboration & reports
      </div>
    </aside>
  );
}
`);
write("src/components/navigation/Sidebar/index.ts", `export * from "./Sidebar";
`);

write("src/components/navigation/Header/Header.tsx", `import React from "react";
import { Link } from "react-router-dom";
import { Bell, LogOut, User } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useNotificationContext } from "@/contexts/NotificationContext";
import { Avatar } from "@/components/common/Avatar";
import { Dropdown } from "@/components/common/Dropdown";

export function Header({ title }: { title?: string }) {
  const { user, logout } = useAuthContext();
  const { unread } = useNotificationContext();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950/70 px-4 backdrop-blur md:px-6">
      <div>
        <h1 className="font-display text-lg font-semibold text-slate-50">{title || "Cloud Platform"}</h1>
      </div>
      <div className="flex items-center gap-3">
        <Link
          to="/app/notifications"
          className="relative rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:text-sky-300"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          ) : null}
        </Link>
        <Dropdown
          trigger={
            <span className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 py-1 pl-1 pr-3">
              <Avatar name={user?.name || "User"} src={user?.avatarUrl} />
              <span className="hidden text-sm text-slate-200 sm:inline">{user?.name || "Guest"}</span>
            </span>
          }
          items={[
            {
              label: "Profile",
              onClick: () => {
                window.location.href = "/app/profile";
              },
            },
            {
              label: "Settings",
              onClick: () => {
                window.location.href = "/app/settings";
              },
            },
            { label: "Sign out", onClick: () => void logout(), danger: true },
          ]}
        />
      </div>
    </header>
  );
}
`);
write("src/components/navigation/Header/index.ts", `export * from "./Header";
`);

write("src/components/navigation/Navbar/Navbar.tsx", `import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@researchmind/ui";
import { cn } from "@researchmind/utils";

const links = [
  { to: "/pricing", label: "Pricing" },
  { to: "/download", label: "Download" },
  { to: "/docs", label: "Docs" },
  { to: "/blog", label: "Blog" },
  { to: "/about", label: "About" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.svg" alt="ResearchMind" className="h-8 w-8" />
          <span className="font-display text-lg font-bold text-slate-50">
            Research<span className="text-sky-400">Mind</span>
          </span>
        </Link>
        <div className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn("text-sm font-medium", isActive ? "text-sky-300" : "text-slate-400 hover:text-slate-200")
              }
            >
              {l.label}
            </NavLink>
          ))}
          <Link to="/login">
            <Button size="sm" variant="secondary">
              Sign in
            </Button>
          </Link>
          <Link to="/app">
            <Button size="sm">Open Cloud</Button>
          </Link>
        </div>
        <button type="button" className="md:hidden text-slate-300" onClick={() => setOpen((v) => !v)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open ? (
        <div className="border-t border-slate-800 px-4 py-3 md:hidden">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="block py-2 text-sm text-slate-300" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <Link to="/login" className="mt-2 block text-sm text-sky-300" onClick={() => setOpen(false)}>
            Sign in
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
`);
write("src/components/navigation/Navbar/index.ts", `export * from "./Navbar";
`);

write("src/components/navigation/Breadcrumb/Breadcrumb.tsx", `import React from "react";
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
`);
write("src/components/navigation/Breadcrumb/index.ts", `export * from "./Breadcrumb";
`);

write("src/components/navigation/Footer/Footer.tsx", `import React from "react";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="font-display text-lg font-bold text-slate-50">ResearchMind</div>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            Local-first AI research assistant. Desktop holds your papers; Cloud hosts reports, backups and collaboration.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-200">Product</div>
          <div className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
            <Link to="/download">Download</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/docs">Docs</Link>
            <Link to="/changelog">Changelog</Link>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-200">Legal</div>
          <div className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} ResearchMind. Local-first power + cloud collaboration.
      </div>
    </footer>
  );
}
`);
write("src/components/navigation/Footer/index.ts", `export * from "./Footer";
`);

// domain components
write("src/components/dashboard/StatCard.tsx", `import React from "react";
import { Card, CardContent } from "@researchmind/ui";

export function StatCard({
  label,
  value,
  sub,
  color = "#38bdf8",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent>
        <div className="text-sm text-slate-400">{label}</div>
        <div className="mt-2 font-display text-3xl font-bold" style={{ color }}>
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
`);

write("src/components/dashboard/RecentList.tsx", `import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@researchmind/ui";

export function RecentList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon?: React.ReactNode;
  items: { id: string; title: string; subtitle?: string; badge?: string; href?: string }[];
  empty?: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!items.length ? (
          <p className="text-sm text-slate-500">{empty || "Nothing here yet."}</p>
        ) : (
          items.map((item) => {
            const body = (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                  {item.subtitle ? <div className="mt-0.5 text-xs text-slate-500">{item.subtitle}</div> : null}
                </div>
                {item.badge ? <Badge tone="info">{item.badge}</Badge> : null}
              </div>
            );
            return item.href ? (
              <Link key={item.id} to={item.href} className="block transition hover:opacity-90">
                {body}
              </Link>
            ) : (
              <div key={item.id}>{body}</div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
`);

write("src/components/workspace/WorkspaceCard.tsx", `import React from "react";
import { Link } from "react-router-dom";
import type { Workspace } from "@researchmind/types";
import { Badge, Button, Card, CardContent } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";

function toneFor(state: Workspace["syncState"]) {
  if (state === "Synced") return "success" as const;
  if (state === "Conflict") return "danger" as const;
  if (state === "Backup Available") return "warning" as const;
  return "default" as const;
}

export function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-50">{workspace.name}</h3>
            <Badge tone={toneFor(workspace.syncState)}>{workspace.syncState}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">{workspace.description}</p>
          <p className="mt-2 text-xs text-slate-500">
            {workspace.paperCount} papers · {workspace.reportCount} reports · updated{" "}
            {formatRelativeTime(workspace.updatedAt)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-600">{workspace.id}</p>
        </div>
        <div className="flex gap-2">
          <Link to={\`/app/workspaces/\${workspace.id}\`}>
            <Button size="sm">Open</Button>
          </Link>
          <Link to={\`/r/\${workspace.id}\`}>
            <Button size="sm" variant="outline">
              Live report
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
`);

write("src/components/reports/ReportRow.tsx", `import React from "react";
import { ExternalLink } from "lucide-react";
import type { Report } from "@researchmind/types";
import { Badge, Button } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";
import { useClipboard } from "@/hooks/useClipboard";

export function ReportRow({ report }: { report: Report }) {
  const { copied, copy } = useClipboard();
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-50">{report.title}</h3>
          <Badge tone={report.type === "Live Report" ? "success" : "purple"}>{report.type}</Badge>
          <Badge>{report.visibility}</Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-sky-400">{report.url}</p>
        <p className="mt-1 text-xs text-slate-500">
          v{report.version} · updated {formatRelativeTime(report.updatedAt)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void copy(report.url)}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a href={report.url} target="_blank" rel="noreferrer">
          <Button size="sm">
            <ExternalLink className="h-4 w-4" /> Open
          </Button>
        </a>
      </div>
    </div>
  );
}
`);

write("src/components/analytics/MetricGrid.tsx", `import React from "react";
import type { AnalyticsSummary } from "@researchmind/types";
import { StatCard } from "@/components/dashboard/StatCard";

export function MetricGrid({ data }: { data: AnalyticsSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Workspaces" value={data.workspaces} sub="Cloud-linked" color="#38bdf8" />
      <StatCard label="Reports" value={data.reports} sub={\`\${data.snapshots} snapshots\`} color="#34d399" />
      <StatCard label="Papers (metadata)" value={data.papers} sub={\`\${data.storageMb} MB\`} color="#a855f7" />
      <StatCard label="Sync health" value={\`\${data.syncHealth}%\`} sub={\`\${data.activityLast7d} events / 7d\`} color="#f59e0b" />
    </div>
  );
}
`);

write("src/components/activity/ActivityFeed.tsx", `import React from "react";
import type { ActivityItem } from "@researchmind/types";
import { Activity } from "lucide-react";
import { formatRelativeTime } from "@researchmind/utils";

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((act) => (
        <div key={act.id} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="rounded-lg bg-sky-500/10 p-2 text-sky-400">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">{act.title}</div>
            <div className="mt-0.5 text-sm text-slate-400">{act.detail}</div>
            <div className="mt-1 text-xs text-slate-500">{formatRelativeTime(act.timestamp)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
`);

write("src/components/notification/NotificationList.tsx", `import React from "react";
import { Link } from "react-router-dom";
import type { NotificationItem } from "@researchmind/types";
import { Badge } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";

export function NotificationList({ items }: { items: NotificationItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((n) => {
        const body = (
          <div className={\`rounded-xl border p-4 \${n.read ? "border-slate-800 bg-slate-950/30" : "border-sky-500/20 bg-sky-500/5"}\`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-slate-100">{n.title}</div>
                <div className="mt-1 text-sm text-slate-400">{n.body}</div>
                <div className="mt-2 text-xs text-slate-500">{formatRelativeTime(n.createdAt)}</div>
              </div>
              <Badge tone={n.read ? "default" : "info"}>{n.kind}</Badge>
            </div>
          </div>
        );
        return n.href ? (
          <Link key={n.id} to={n.href}>
            {body}
          </Link>
        ) : (
          <div key={n.id}>{body}</div>
        );
      })}
    </div>
  );
}
`);

write("src/components/backup/BackupList.tsx", `import React from "react";
import type { BackupRecord } from "@researchmind/types";
import { Badge, Button } from "@researchmind/ui";
import { formatBytes, formatRelativeTime } from "@researchmind/utils";

export function BackupList({
  items,
  onRestore,
}: {
  items: BackupRecord[];
  onRestore?: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((b) => (
        <div key={b.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-100">{b.name}</h3>
              <Badge tone={b.status === "completed" ? "success" : b.status === "failed" ? "danger" : "warning"}>
                {b.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {b.type} · {formatBytes(b.sizeBytes)} · {formatRelativeTime(b.createdAt)}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => onRestore?.(b.id)}>
            Restore
          </Button>
        </div>
      ))}
    </div>
  );
}
`);

write("src/components/billing/PlanCard.tsx", `import React from "react";
import type { BillingPlan } from "@researchmind/types";
import { Badge, Button, Card, CardContent } from "@researchmind/ui";
import { formatCurrency } from "@researchmind/utils";
import { Check } from "lucide-react";

export function PlanCard({
  plan,
  current,
  onSelect,
}: {
  plan: BillingPlan;
  current?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Card className={plan.highlighted ? "border-sky-500/40 shadow-glow" : ""}>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-slate-50">{plan.name}</h3>
          {current ? <Badge tone="success">Current</Badge> : null}
        </div>
        <div className="font-display text-3xl font-bold text-sky-300">
          {formatCurrency(plan.priceMonthly, plan.currency)}
          <span className="text-sm font-normal text-slate-500">/mo</span>
        </div>
        <ul className="space-y-2 text-sm text-slate-300">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              {f}
            </li>
          ))}
        </ul>
        <Button className="w-full" variant={plan.highlighted ? "primary" : "secondary"} onClick={onSelect}>
          {current ? "Manage plan" : "Choose plan"}
        </Button>
      </CardContent>
    </Card>
  );
}
`);

write("src/components/account/ProfileForm.tsx", `import React, { useState } from "react";
import type { User } from "@researchmind/types";
import { Button, Input } from "@researchmind/ui";

export function ProfileForm({
  user,
  onSave,
}: {
  user: User;
  onSave: (patch: { name: string; email: string }) => Promise<void> | void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave({ name, email });
        setSaving(false);
        setMessage("Profile saved (local session).");
      }}
    >
      <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="text-xs text-slate-500">Plan: {user.plan} · Verified: {user.emailVerified ? "yes" : "no"}</div>
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      <Button type="submit" loading={saving}>
        Save profile
      </Button>
    </form>
  );
}
`);

// layouts
write("src/layouts/MainLayout/MainLayout.tsx", `import React from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/navigation/Navbar";
import { Footer } from "@/components/navigation/Footer";

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
`);
write("src/layouts/MainLayout/index.ts", `export * from "./MainLayout";
`);

write("src/layouts/AuthLayout/AuthLayout.tsx", `import React from "react";
import { Link, Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8 flex items-center gap-2">
        <img src="/logo.svg" alt="" className="h-9 w-9" />
        <span className="font-display text-xl font-bold">ResearchMind Cloud</span>
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
        <Outlet />
      </div>
    </div>
  );
}
`);
write("src/layouts/AuthLayout/index.ts", `export * from "./AuthLayout";
`);

write("src/layouts/DashboardLayout/DashboardLayout.tsx", `import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Header } from "@/components/navigation/Header";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { NotificationProvider } from "@/contexts/NotificationContext";

const titles: Record<string, string> = {
  "/app": "Dashboard",
  "/app/workspaces": "Workspaces",
  "/app/reports": "Report Center",
  "/app/snapshots": "Snapshots",
  "/app/activity": "Activity Feed",
  "/app/analytics": "Analytics",
  "/app/notifications": "Notifications",
  "/app/backups": "Cloud Backups",
  "/app/devices": "Devices",
  "/app/team": "Team",
  "/app/billing": "Billing",
  "/app/settings": "Settings",
  "/app/profile": "Profile",
  "/app/api-keys": "API Keys",
  "/app/help": "Help Center",
  "/app/feedback": "Feedback",
};

export function DashboardLayout() {
  const { pathname } = useLocation();
  const title =
    titles[pathname] ||
    (pathname.startsWith("/app/workspaces/") ? "Workspace" : "Cloud Platform");

  return (
    <WorkspaceProvider>
      <NotificationProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header title={title} />
            <div className="flex-1 px-4 py-6 md:px-6">
              <Outlet />
            </div>
          </div>
        </div>
      </NotificationProvider>
    </WorkspaceProvider>
  );
}
`);
write("src/layouts/DashboardLayout/index.ts", `export * from "./DashboardLayout";
`);

write("src/layouts/ReportLayout/ReportLayout.tsx", `import React from "react";
import { Link, Outlet } from "react-router-dom";

export function ReportLayout() {
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <img src="/logo.svg" alt="" className="h-7 w-7" />
            ResearchMind Report
          </Link>
          <Link to="/app/reports" className="text-sm text-sky-400 hover:text-sky-300">
            Manage reports
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
`);
write("src/layouts/ReportLayout/index.ts", `export * from "./ReportLayout";
`);

write("src/layouts/EmptyLayout/EmptyLayout.tsx", `import React from "react";
import { Outlet } from "react-router-dom";

export function EmptyLayout() {
  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  );
}
`);
write("src/layouts/EmptyLayout/index.ts", `export * from "./EmptyLayout";
`);

console.log("Part 3 UI components/layouts done");
