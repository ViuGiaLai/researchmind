/**
 * Part 4: all pages, features, routes, app bootstrap
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

function page(name, body) {
  write(`src/pages/${name}/index.tsx`, body);
}

// Landing
page("Landing", `import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Cloud, Lock, Monitor, Sparkles } from "lucide-react";
import { Button, Card, CardContent } from "@researchmind/ui";

const features = [
  {
    icon: Monitor,
    title: "Desktop is the IDE",
    desc: "Papers, RAG chat, matrices and vectors stay local-first on your machine.",
  },
  {
    icon: Cloud,
    title: "Cloud is the platform",
    desc: "Stable report URLs, backups, devices, team invites and billing live here.",
  },
  {
    icon: Lock,
    title: "Explicit sync only",
    desc: "No silent upload of research libraries. Metadata and reports move when you choose.",
  },
];

export default function LandingPage() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
            <Sparkles className="h-3.5 w-3.5" /> Local-first · Cloud collaboration · v1
          </div>
          <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold tracking-tight text-slate-50 md:text-6xl">
            Academic research with an{" "}
            <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              AI workspace
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-400">
            ResearchMind Desktop manages your PDF library and analysis. ResearchMind Cloud hosts live reports,
            snapshots, backups and multi-device identity — built as a long-term SaaS from day one.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/download">
              <Button size="lg">
                Download Desktop <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/app">
              <Button size="lg" variant="secondary">
                Open Cloud Dashboard
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="ghost">
                View pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardContent>
                <f.icon className="h-6 w-6 text-sky-400" />
                <h3 className="mt-4 font-semibold text-slate-50">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
`);

page("Pricing", `import React, { useEffect, useState } from "react";
import type { BillingPlan } from "@researchmind/types";
import { listPlans } from "@/services/billing";
import { PlanCard } from "@/components/billing/PlanCard";
import { Loading } from "@/components/common/Loading";

export default function PricingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [current, setCurrent] = useState<string>("pro");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPlans().then((res) => {
      setPlans(res.data);
      setCurrent(res.current);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="text-center">
        <h1 className="page-title">Simple, transparent pricing</h1>
        <p className="page-subtitle mx-auto max-w-xl">
          Free for local research. Pro unlocks cloud reports & backups. Lab adds team collaboration.
        </p>
      </div>
      {loading ? (
        <Loading />
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} current={p.id === current} />
          ))}
        </div>
      )}
    </div>
  );
}
`);

page("About", `import React from "react";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose-invert">
      <h1 className="page-title">About ResearchMind</h1>
      <p className="page-subtitle">
        ResearchMind is a local-first AI research assistant for academics. Desktop is the product; Cloud is the
        long-term platform for reports, backups, identity and collaboration.
      </p>
      <div className="mt-8 space-y-4 text-slate-300">
        <p>
          Your PDFs, notes, chats and vectors stay on your device by default. Cloud features are opt-in and
          explicit — no silent migration of a research library.
        </p>
        <p>
          This monorepo ships shared packages so Desktop and Web share types, API clients and sync semantics for
          the next 5+ years of product growth.
        </p>
      </div>
    </div>
  );
}
`);

page("Download", `import React from "react";
import { Button, Card, CardContent } from "@researchmind/ui";
import { desktopDownloadUrl } from "@/utils/urls";
import { Monitor, Apple, Terminal } from "lucide-react";

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="page-title">Download ResearchMind Desktop</h1>
      <p className="page-subtitle">The research IDE runs on your machine. Cloud complements it — it does not replace it.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { icon: Monitor, name: "Windows", desc: "Installer + portable" },
          { icon: Apple, name: "macOS", desc: "Apple Silicon & Intel" },
          { icon: Terminal, name: "Linux", desc: "AppImage / deb" },
        ].map((p) => (
          <Card key={p.name}>
            <CardContent className="space-y-3">
              <p.icon className="h-6 w-6 text-sky-400" />
              <h3 className="font-semibold text-slate-50">{p.name}</h3>
              <p className="text-sm text-slate-400">{p.desc}</p>
              <a href={desktopDownloadUrl()} target="_blank" rel="noreferrer">
                <Button className="w-full">Download</Button>
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
`);

page("Blog", `import React from "react";
import { Card, CardContent } from "@researchmind/ui";
import { Link } from "react-router-dom";

const posts = [
  { slug: "local-first-cloud", title: "Why ResearchMind is local-first (and still has Cloud)", date: "2026-07-01" },
  { slug: "stable-report-urls", title: "Stable report URLs for peer review", date: "2026-06-12" },
  { slug: "desktop-sync", title: "How metadata sync works without uploading your PDFs", date: "2026-05-20" },
];

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="page-title">Blog</h1>
      <p className="page-subtitle">Product notes, research workflows and release stories.</p>
      <div className="mt-8 space-y-4">
        {posts.map((p) => (
          <Card key={p.slug}>
            <CardContent>
              <div className="text-xs text-slate-500">{p.date}</div>
              <h2 className="mt-1 text-lg font-semibold text-slate-50">{p.title}</h2>
              <Link to="/changelog" className="mt-2 inline-block text-sm text-sky-400">
                Read more →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
`);

page("Docs", `import React from "react";
import { Card, CardContent } from "@researchmind/ui";

const sections = [
  { title: "Desktop IDE", items: ["Import PDFs", "RAG chat with citations", "Evidence matrix", "Knowledge graph"] },
  { title: "Cloud Platform", items: ["Live reports", "Snapshots", "Backups", "Devices"] },
  { title: "API", items: ["Auth with Clerk", "Workspaces", "Reports v1", "Sync protocol"] },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="page-title">Documentation</h1>
      <p className="page-subtitle">Guides for Desktop, Cloud and the shared API surface.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardContent>
              <h3 className="font-semibold text-sky-300">{s.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                {s.items.map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
`);

page("Changelog", `import React from "react";

const entries = [
  { version: "1.0.0", date: "2026-07-25", notes: ["Cloud web monorepo scaffold", "Dashboard, workspaces, reports MVP", "Shared packages for Desktop + Web"] },
  { version: "0.6.0", date: "2026-06-01", notes: ["Desktop local-first release", "Cloud Free gateway", "Public report routes"] },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="page-title">Changelog</h1>
      <div className="mt-8 space-y-8">
        {entries.map((e) => (
          <div key={e.version} className="border-l-2 border-sky-500/40 pl-4">
            <div className="font-semibold text-slate-50">v{e.version}</div>
            <div className="text-xs text-slate-500">{e.date}</div>
            <ul className="mt-2 space-y-1 text-sm text-slate-400">
              {e.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
`);

page("Contact", `import React, { useState } from "react";
import { Button, Input } from "@researchmind/ui";
import { APP_CONFIG } from "@researchmind/config";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="page-title">Contact</h1>
      <p className="page-subtitle">Reach us at {APP_CONFIG.supportEmail}</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
      >
        <Input label="Name" name="name" required />
        <Input label="Email" type="email" name="email" required />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-300">Message</span>
          <textarea className="min-h-[120px] rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100 outline-none focus:border-sky-500" required />
        </label>
        {sent ? <p className="text-sm text-emerald-400">Thanks — message captured locally (wire email provider later).</p> : null}
        <Button type="submit">Send message</Button>
      </form>
    </div>
  );
}
`);

// Auth pages
page("Login", `import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button, Input } from "@researchmind/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { validateLogin } from "@/utils/validation";

export default function LoginPage() {
  const { login } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from || "/app";
  const [email, setEmail] = useState("researcher@researchmind.app");
  const [password, setPassword] = useState("password");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-50">Sign in</h1>
      <p className="mt-1 text-sm text-slate-400">Access your ResearchMind Cloud dashboard</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = validateLogin(email, password);
          setErrors(v);
          if (Object.keys(v).length) return;
          setLoading(true);
          setFormError("");
          try {
            await login(email, password);
            navigate(from, { replace: true });
          } catch (err) {
            setFormError(err instanceof Error ? err.message : "Login failed");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        {formError ? <p className="text-sm text-rose-400">{formError}</p> : null}
        <Button type="submit" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm text-slate-400">
        <Link to="/forgot-password" className="hover:text-sky-300">Forgot password?</Link>
        <Link to="/register" className="hover:text-sky-300">Create account</Link>
      </div>
      <p className="mt-4 text-xs text-slate-500">Mock auth is enabled by default (VITE_USE_MOCKS=true).</p>
    </div>
  );
}
`);

page("Register", `import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input } from "@researchmind/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { validateRegister } from "@/utils/validation";

export default function RegisterPage() {
  const { register } = useAuthContext();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Create account</h1>
      <p className="mt-1 text-sm text-slate-400">Cloud identity for reports, backups and devices</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = validateRegister(name, email, password);
          setErrors(v);
          if (Object.keys(v).length) return;
          setLoading(true);
          await register(name, email, password);
          setLoading(false);
          navigate("/app");
        }}
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <Button type="submit" className="w-full" loading={loading}>Create account</Button>
      </form>
      <p className="mt-4 text-sm text-slate-400">
        Already have an account? <Link to="/login" className="text-sky-400">Sign in</Link>
      </p>
    </div>
  );
}
`);

page("VerifyEmail", `import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@researchmind/ui";

export default function VerifyEmailPage() {
  return (
    <div className="text-center">
      <h1 className="font-display text-2xl font-bold">Verify your email</h1>
      <p className="mt-2 text-sm text-slate-400">We sent a verification link to your inbox. Mock mode skips this step.</p>
      <Link to="/login" className="mt-6 inline-block">
        <Button>Back to sign in</Button>
      </Link>
    </div>
  );
}
`);

page("ForgotPassword", `import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input } from "@researchmind/ui";
import { requestPasswordReset } from "@/services/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Reset password</h1>
      <p className="mt-1 text-sm text-slate-400">We'll email a reset link when auth provider is wired.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          await requestPasswordReset(email);
          setDone(true);
          setLoading(false);
        }}
      >
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {done ? <p className="text-sm text-emerald-400">If an account exists, a reset email would be sent.</p> : null}
        <Button type="submit" className="w-full" loading={loading}>Send reset link</Button>
      </form>
      <Link to="/login" className="mt-4 inline-block text-sm text-sky-400">Back to sign in</Link>
    </div>
  );
}
`);

// App pages
page("Dashboard", `import React, { useEffect, useState } from "react";
import { Cloud, FileText, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useReports } from "@/hooks/useReports";
import { useActivity } from "@/hooks/useActivity";
import { getAnalytics } from "@/services/analytics";
import type { AnalyticsSummary } from "@researchmind/types";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentList } from "@/components/dashboard/RecentList";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { Loading } from "@/components/common/Loading";
import { formatRelativeTime } from "@researchmind/utils";

export default function DashboardPage() {
  const { workspaces, loading: wsLoading } = useWorkspace();
  const { reports, loading: rptLoading } = useReports();
  const { activity } = useActivity();
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    getAnalytics().then(setAnalytics);
  }, []);

  if (wsLoading || rptLoading || !analytics) return <Loading label="Loading dashboard…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="page-title">Research Dashboard</h2>
          <p className="page-subtitle">Cloud sync, workspaces and scientific reports overview</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" /> Desktop IDE connected
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Workspaces" value={analytics.workspaces} sub="Synced + local" color="#38bdf8" />
        <StatCard label="Reports exported" value={analytics.reports} sub={\`\${analytics.snapshots} snapshots\`} color="#34d399" />
        <StatCard label="Papers (metadata)" value={analytics.papers} sub="Not full PDF store" color="#a855f7" />
        <StatCard label="Storage" value={\`\${analytics.storageMb} MB\`} sub={\`Sync health \${analytics.syncHealth}%\`} color="#f59e0b" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentList
          title="Recent workspaces"
          icon={<Cloud className="h-4 w-4 text-sky-400" />}
          items={workspaces.map((w) => ({
            id: w.id,
            title: w.name,
            subtitle: \`\${w.paperCount} papers · \${formatRelativeTime(w.updatedAt)}\`,
            badge: w.syncState,
            href: \`/app/workspaces/\${w.id}\`,
          }))}
        />
        <RecentList
          title="Public reports"
          icon={<FileText className="h-4 w-4 text-emerald-400" />}
          items={reports.map((r) => ({
            id: r.id,
            title: r.title,
            subtitle: r.url,
            badge: r.type,
            href: \`/r/\${r.id}\`,
          }))}
        />
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold text-slate-100">Latest activity</h3>
        <ActivityFeed items={activity.slice(0, 4)} />
      </div>
    </div>
  );
}
`);

page("Workspace", `import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { WorkspaceCard } from "@/components/workspace/WorkspaceCard";
import { SearchBar } from "@/components/common/SearchBar";
import { Loading } from "@/components/common/Loading";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { Badge, Card, CardContent } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";

export default function WorkspacePage() {
  const { id } = useParams();
  const { workspaces, loading } = useWorkspace();
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () => workspaces.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()) || w.id.includes(q)),
    [workspaces, q],
  );

  if (loading) return <Loading />;

  if (id) {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return <p className="text-slate-400">Workspace not found.</p>;
    return (
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "Workspaces", to: "/app/workspaces" }, { label: ws.name }]} />
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="page-title">{ws.name}</h2>
          <Badge tone="info">{ws.syncState}</Badge>
        </div>
        <p className="page-subtitle">{ws.description}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent><div className="text-xs text-slate-500">Papers</div><div className="text-2xl font-bold text-sky-300">{ws.paperCount}</div></CardContent></Card>
          <Card><CardContent><div className="text-xs text-slate-500">Reports</div><div className="text-2xl font-bold text-emerald-300">{ws.reportCount}</div></CardContent></Card>
          <Card><CardContent><div className="text-xs text-slate-500">Members</div><div className="text-2xl font-bold text-violet-300">{ws.memberCount}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="space-y-2 text-sm text-slate-400">
            <div>ID: <span className="font-mono text-slate-300">{ws.id}</span></div>
            <div>Updated: {formatRelativeTime(ws.updatedAt)}</div>
            <div>Owner: {ws.ownerUid}</div>
            <p className="pt-2 text-slate-500">
              Full paper bodies remain on Desktop. Cloud stores workspace metadata and optional report payloads.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">Workspaces</h2>
          <p className="page-subtitle">Cloud-linked research workspaces and sync state</p>
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Search workspaces…" />
      </div>
      <div className="space-y-3">
        {filtered.map((w) => (
          <WorkspaceCard key={w.id} workspace={w} />
        ))}
      </div>
    </div>
  );
}
`);

page("Reports", `import React, { useMemo, useState } from "react";
import { useReports } from "@/hooks/useReports";
import { ReportRow } from "@/components/reports/ReportRow";
import { SearchBar } from "@/components/common/SearchBar";
import { Tabs } from "@/components/common/Tabs";
import { Loading } from "@/components/common/Loading";

export default function ReportsPage() {
  const { reports, loading } = useReports();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      const matchQ = r.title.toLowerCase().includes(q.toLowerCase()) || r.id.includes(q);
      const matchTab =
        tab === "all" ||
        (tab === "live" && r.type === "Live Report") ||
        (tab === "snapshot" && r.type === "Snapshot");
      return matchQ && matchTab;
    });
  }, [reports, q, tab]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Report Center</h2>
        <p className="page-subtitle">Stable cloud report URLs and snapshot history</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: "All" },
            { id: "live", label: "Live" },
            { id: "snapshot", label: "Snapshots" },
          ]}
        />
        <SearchBar value={q} onChange={setQ} placeholder="Search reports…" />
      </div>
      <div className="space-y-3">
        {filtered.map((r) => (
          <ReportRow key={r.id} report={r} />
        ))}
      </div>
    </div>
  );
}
`);

page("Snapshots", `import React, { useEffect, useState } from "react";
import type { Snapshot } from "@researchmind/types";
import { listSnapshots } from "@/services/snapshots";
import { Loading } from "@/components/common/Loading";
import { Badge, Card, CardContent } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";

export default function SnapshotsPage() {
  const [items, setItems] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSnapshots().then((res) => {
      setItems(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Snapshots</h2>
        <p className="page-subtitle">Frozen report versions for peer review and citation</p>
      </div>
      <div className="space-y-3">
        {items.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-50">{s.title}</h3>
                  <Badge tone="purple">v{s.version}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{s.note} · {formatRelativeTime(s.createdAt)}</p>
              </div>
              <a href={s.url} className="text-sm text-sky-400" target="_blank" rel="noreferrer">
                Open snapshot
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
`);

page("ReportViewer", `import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Report } from "@researchmind/types";
import { getReport } from "@/services/reports";
import { Loading } from "@/components/common/Loading";
import { Badge, Button, Card, CardContent } from "@researchmind/ui";
import { formatDate } from "@researchmind/utils";
import { useClipboard } from "@/hooks/useClipboard";

export default function ReportViewerPage() {
  const { id } = useParams();
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const { copied, copy } = useClipboard();

  useEffect(() => {
    if (!id) return;
    getReport(id).then((r) => setReport(r || null));
  }, [id]);

  if (report === undefined) return <Loading label="Loading report…" />;
  if (!report) {
    return (
      <Card>
        <CardContent>
          <h1 className="text-xl font-bold">Report not found</h1>
          <p className="mt-2 text-sm text-slate-400">No cloud report with id “{id}”.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">{report.title}</h1>
            <Badge tone={report.type === "Live Report" ? "success" : "purple"}>{report.type}</Badge>
            <Badge>{report.visibility}</Badge>
          </div>
          <p className="page-subtitle">
            Version {report.version} · updated {formatDate(report.updatedAt)}
          </p>
        </div>
        <Button variant="secondary" onClick={() => void copy(report.url)}>
          {copied ? "Copied" : "Copy public link"}
        </Button>
      </div>

      <Card>
        <CardContent className="prose prose-invert max-w-none">
          <h2 className="text-lg font-semibold text-slate-100">Abstract / summary</h2>
          <p className="mt-2 text-slate-300">
            {report.summary ||
              "This is a cloud-hosted research report shell. Desktop publishes full HTML/PDF content to the report API; the viewer embeds that payload here."}
          </p>
          <hr className="my-6 border-slate-800" />
          <h3 className="font-semibold text-slate-200">Report metadata</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            <li>ID: <span className="font-mono text-slate-300">{report.id}</span></li>
            <li>Workspace: <span className="font-mono text-slate-300">{report.workspaceId}</span></li>
            <li>Public URL: <a className="text-sky-400" href={report.url}>{report.url}</a></li>
          </ul>
          <div className="mt-8 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
            Report body iframe / HTML payload mount point
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
`);

page("Activity", `import React from "react";
import { useActivity } from "@/hooks/useActivity";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { Loading } from "@/components/common/Loading";

export default function ActivityPage() {
  const { activity, loading } = useActivity();
  if (loading) return <Loading />;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Activity Feed</h2>
        <p className="page-subtitle">Research & sync activity across devices</p>
      </div>
      <ActivityFeed items={activity} />
    </div>
  );
}
`);

page("Analytics", `import React, { useEffect, useState } from "react";
import type { AnalyticsSummary } from "@researchmind/types";
import { getAnalytics } from "@/services/analytics";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { Loading } from "@/components/common/Loading";
import { Card, CardContent } from "@researchmind/ui";

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  useEffect(() => {
    getAnalytics().then(setData);
  }, []);
  if (!data) return <Loading />;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Analytics</h2>
        <p className="page-subtitle">Cloud usage, sync health and report volume</p>
      </div>
      <MetricGrid data={data} />
      <Card>
        <CardContent className="text-sm text-slate-400">
          Charts can plug into this page later (activity over time, report views, backup storage). Metrics currently
          come from mock analytics / future \`/analytics\` endpoint.
        </CardContent>
      </Card>
    </div>
  );
}
`);

page("Notifications", `import React from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationList } from "@/components/notification/NotificationList";
import { Button } from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";

export default function NotificationsPage() {
  const { notifications, loading, unread, markAll } = useNotifications();
  if (loading) return <Loading />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Notifications</h2>
          <p className="page-subtitle">{unread} unread</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void markAll()}>
          Mark all read
        </Button>
      </div>
      <NotificationList items={notifications} />
    </div>
  );
}
`);

page("Backups", `import React, { useState } from "react";
import { useBackups } from "@/hooks/useBackups";
import { BackupList } from "@/components/backup/BackupList";
import { Button } from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";

export default function BackupsPage() {
  const { backups, loading, createBackup } = useBackups();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Cloud Backups</h2>
          <p className="page-subtitle">Workspace metadata, settings and prompt backups</p>
        </div>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await createBackup({ name: "Manual backup " + new Date().toLocaleString() });
            setBusy(false);
            setMsg("Backup created.");
          }}
        >
          Create backup
        </Button>
      </div>
      {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}
      <BackupList
        items={backups}
        onRestore={(id) => setMsg(\`Restore queued for \${id} (Desktop will pull on next sync).\`)}
      />
    </div>
  );
}
`);

page("Devices", `import React, { useEffect, useState } from "react";
import type { Device } from "@researchmind/types";
import { listDevices } from "@/services/devices";
import { Badge, Card, CardContent } from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";
import { formatRelativeTime } from "@researchmind/utils";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listDevices().then((res) => {
      setDevices(res.data);
      setLoading(false);
    });
  }, []);
  if (loading) return <Loading />;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Devices</h2>
        <p className="page-subtitle">Linked Desktop and browser sessions</p>
      </div>
      <div className="space-y-3">
        {devices.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-50">{d.name}</h3>
                  {d.current ? <Badge tone="info">This device</Badge> : null}
                  {d.trusted ? <Badge tone="success">Trusted</Badge> : <Badge tone="warning">Untrusted</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {d.platform} · last seen {formatRelativeTime(d.lastSeenAt)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
`);

page("Team", `import React from "react";
import { mockMembers } from "@/mocks/data";
import { Badge, Button, Card, CardContent, Input } from "@researchmind/ui";
import { useState } from "react";

export default function TeamPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Team</h2>
        <p className="page-subtitle">Invite collaborators to cloud workspaces (Phase 3)</p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input placeholder="colleague@lab.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button
            onClick={() => {
              setMsg(\`Invite queued for \${email || "email"}\`);
              setEmail("");
            }}
          >
            Invite member
          </Button>
        </CardContent>
      </Card>
      {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}
      <div className="space-y-2">
        {mockMembers.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-slate-100">{m.name}</div>
                <div className="text-xs text-slate-500">{m.email}</div>
              </div>
              <Badge>{m.role}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
`);

page("Billing", `import React, { useEffect, useState } from "react";
import type { BillingPlan } from "@researchmind/types";
import { listPlans } from "@/services/billing";
import { PlanCard } from "@/components/billing/PlanCard";
import { Loading } from "@/components/common/Loading";

export default function BillingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [current, setCurrent] = useState("pro");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listPlans().then((res) => {
      setPlans(res.data);
      setCurrent(res.current);
      setLoading(false);
    });
  }, []);
  if (loading) return <Loading />;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Billing</h2>
        <p className="page-subtitle">Manage plan and invoices (Stripe wiring later)</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} current={p.id === current} onSelect={() => setCurrent(p.id)} />
        ))}
      </div>
    </div>
  );
}
`);

page("Settings", `import React, { useEffect } from "react";
import { useSettingsStore } from "@/store/settings.store";
import { Button, Card, CardContent } from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";
import { useThemeContext } from "@/contexts/ThemeContext";

export default function SettingsPage() {
  const { settings, loading, load, save } = useSettingsStore();
  const { theme, setTheme } = useThemeContext();

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !settings) return <Loading />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Settings</h2>
        <p className="page-subtitle">Preferences for Cloud platform</p>
      </div>
      <Card>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Email notifications</span>
            <input
              type="checkbox"
              checked={settings.emailNotifications}
              onChange={(e) => void save({ emailNotifications: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Weekly digest</span>
            <input
              type="checkbox"
              checked={settings.weeklyDigest}
              onChange={(e) => void save({ weeklyDigest: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Auto backup</span>
            <input
              type="checkbox"
              checked={settings.autoBackup}
              onChange={(e) => void save({ autoBackup: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Default report visibility</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1"
              value={settings.defaultVisibility}
              onChange={(e) => void save({ defaultVisibility: e.target.value as any })}
            >
              <option value="public">public</option>
              <option value="unlisted">unlisted</option>
              <option value="private">private</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Theme</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1"
              value={theme}
              onChange={(e) => {
                const v = e.target.value as "dark" | "light" | "system";
                setTheme(v);
                void save({ theme: v });
              }}
            >
              <option value="dark">dark</option>
              <option value="light">light</option>
              <option value="system">system</option>
            </select>
          </label>
          <Button
            variant="secondary"
            onClick={() =>
              void save({
                locale: settings.locale === "en" ? "vi" : "en",
              })
            }
          >
            Locale: {settings.locale} (toggle)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
`);

page("Profile", `import React from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { ProfileForm } from "@/components/account/ProfileForm";
import { USER_KEY } from "@/utils/constants";
import { useAuthStore } from "@/store/auth.store";

export default function ProfilePage() {
  const { user } = useAuthContext();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);

  if (!user) return <p className="text-slate-400">Not signed in.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Profile</h2>
        <p className="page-subtitle">Your cloud identity</p>
      </div>
      <ProfileForm
        user={user}
        onSave={({ name, email }) => {
          const next = { ...user, name, email, updatedAt: new Date().toISOString() };
          localStorage.setItem(USER_KEY, JSON.stringify(next));
          if (token) setSession(next, token);
        }}
      />
    </div>
  );
}
`);

page("ApiKeys", `import React from "react";
import { mockApiKeys } from "@/mocks/data";
import { Badge, Button, Card, CardContent } from "@researchmind/ui";
import { formatRelativeTime } from "@researchmind/utils";
import { useState } from "react";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState(mockApiKeys);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="page-title">API Keys</h2>
          <p className="page-subtitle">Programmatic access to report APIs (Phase 3)</p>
        </div>
        <Button
          onClick={() =>
            setKeys((k) => [
              {
                id: "key_" + Date.now(),
                name: "New key",
                prefix: "rm_live_" + Math.random().toString(36).slice(2, 6),
                createdAt: new Date().toISOString(),
                scopes: ["reports:read"],
              },
              ...k,
            ])
          }
        >
          Create key
        </Button>
      </div>
      <div className="space-y-3">
        {keys.map((k) => (
          <Card key={k.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-50">{k.name}</div>
                <div className="font-mono text-xs text-sky-400">{k.prefix}…</div>
                <div className="mt-1 text-xs text-slate-500">
                  created {formatRelativeTime(k.createdAt)}
                  {k.lastUsedAt ? \` · last used \${formatRelativeTime(k.lastUsedAt)}\` : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {k.scopes.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
`);

page("HelpCenter", `import React from "react";
import { Card, CardContent } from "@researchmind/ui";
import { Link } from "react-router-dom";

export default function HelpCenterPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Help Center</h2>
        <p className="page-subtitle">Desktop IDE and Cloud platform guides</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent>
            <h3 className="font-semibold text-sky-300">Desktop App (Research IDE)</h3>
            <p className="mt-2 text-sm text-slate-400">
              Import PDFs, build knowledge graphs, run evidence matrices and export reports.
            </p>
            <Link to="/docs" className="mt-3 inline-block text-sm text-sky-400">Open docs →</Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h3 className="font-semibold text-emerald-300">Cloud Platform</h3>
            <p className="mt-2 text-sm text-slate-400">
              Stable report URLs, backups, devices and team collaboration.
            </p>
            <Link to="/docs" className="mt-3 inline-block text-sm text-sky-400">Open docs →</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`);

page("Feedback", `import React, { useState } from "react";
import { Button, Input, Card, CardContent } from "@researchmind/ui";

export default function FeedbackPage() {
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Feedback</h2>
        <p className="page-subtitle">Help shape ResearchMind Cloud</p>
      </div>
      <Card>
        <CardContent>
          <form
            className="max-w-lg space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <Input label="Subject" required />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-300">Message</span>
              <textarea className="min-h-[140px] rounded-xl border border-slate-700 bg-slate-950 p-3" required />
            </label>
            {sent ? <p className="text-sm text-emerald-400">Thanks for the feedback!</p> : null}
            <Button type="submit">Submit</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
`);

page("Privacy", `import React from "react";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-4 text-slate-300">
      <h1 className="page-title">Privacy Policy</h1>
      <p className="page-subtitle">Summary of ResearchMind data boundaries</p>
      <p>Research libraries (PDFs, notes, chats, vectors) stay on your device by default.</p>
      <p>Cloud stores account identity, optional report payloads, backups you create, and device metadata.</p>
      <p>We do not silently migrate local research data to servers. Contact support@researchmind.app for deletion requests.</p>
    </div>
  );
}
`);

page("Terms", `import React from "react";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-4 text-slate-300">
      <h1 className="page-title">Terms of Service</h1>
      <p className="page-subtitle">Draft terms for ResearchMind Cloud</p>
      <p>Use ResearchMind in compliance with academic integrity and applicable law.</p>
      <p>Cloud Free / Pro / Lab plans are subject to fair-use limits on API and storage.</p>
      <p>Desktop remains free to run fully offline with your own API keys.</p>
    </div>
  );
}
`);

page("NotFound", `import React from "react";
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
`);

// features modules (barrel + domain logic)
const features = [
  "auth",
  "workspace",
  "reports",
  "snapshots",
  "analytics",
  "activity",
  "backups",
  "notifications",
  "billing",
  "devices",
  "collaboration",
  "settings",
  "profile",
];

for (const f of features) {
  write(
    `src/features/${f}/index.ts`,
    `/** Feature module: ${f} — domain hooks/components re-exported for app pages */\\nexport {};\\n`,
  );
}

write("src/features/auth/api.ts", `export * from "@/services/auth";
`);
write("src/features/workspace/api.ts", `export * from "@/services/workspace";
`);
write("src/features/reports/api.ts", `export * from "@/services/reports";
`);
write("src/features/backups/api.ts", `export * from "@/services/backups";
`);

// constants / theme / i18n / permissions / analytics / workers / tests
write("src/constants/index.ts", `export const NAV_PUBLIC = ["/", "/pricing", "/download", "/docs", "/blog"] as const;
export const NAV_APP = ["/app", "/app/workspaces", "/app/reports"] as const;
`);

write("src/theme/index.ts", `export const themeTokens = {
  colors: {
    bg: "#090d16",
    surface: "#0f172a",
    border: "#1e293b",
    accent: "#38bdf8",
    success: "#34d399",
  },
  radius: {
    md: "0.75rem",
    lg: "1rem",
  },
};
`);

write("src/i18n/index.ts", `import { env } from "@/lib/env";

const dict = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.workspaces": "Workspaces",
    "nav.reports": "Reports",
  },
  vi: {
    "nav.dashboard": "Tổng quan",
    "nav.workspaces": "Workspace",
    "nav.reports": "Báo cáo",
  },
} as const;

export type Locale = keyof typeof dict;

export function t(key: keyof (typeof dict)["en"], locale: Locale = env.defaultLocale) {
  return dict[locale][key] || dict.en[key] || key;
}
`);

write("src/permissions/index.ts", `export { can, planLimit } from "@/utils/permissions";
`);

write("src/analytics/index.ts", `export { track } from "@/lib/analytics";
`);

write("src/workers/sync.worker.ts", `/// <reference lib="webworker" />
/** Placeholder web worker for background metadata sync jobs */
self.onmessage = (event: MessageEvent) => {
  const { type } = event.data || {};
  if (type === "ping") {
    (self as DedicatedWorkerGlobalScope).postMessage({ type: "pong", at: Date.now() });
  }
};
export {};
`);

write("src/tests/format.test.ts", `import { formatBytes, generateWorkspaceId } from "@researchmind/utils";

// Lightweight smoke assertions runnable later with vitest
export function runSmoke() {
  if (!formatBytes(1024).includes("KB")) throw new Error("formatBytes failed");
  if (!generateWorkspaceId().startsWith("ws_")) throw new Error("workspace id failed");
  return true;
}
`);

// routes
write("src/routes/protected.tsx", `import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { env } from "@/lib/env";
import { Loading } from "@/components/common/Loading";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated, user } = useAuthContext();
  const location = useLocation();

  if (!hydrated) return <Loading label="Checking session…" />;

  // Dev-friendly: if auth not required and no session, auto-allow via soft gate
  if (!isAuthenticated) {
    if (!env.authRequired) {
      // still require explicit login for clarity in SaaS shell
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

export function useRequireUser() {
  const { user } = useAuthContext();
  return user;
}
`);

write("src/routes/public.tsx", `import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { Loading } from "@/components/common/Loading";

/** Redirect authenticated users away from auth pages */
export function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useAuthContext();
  if (!hydrated) return <Loading />;
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
`);

write("src/routes/report.tsx", `import React from "react";
import { ReportLayout } from "@/layouts/ReportLayout";

export function ReportRouteShell() {
  return <ReportLayout />;
}
`);

write("src/routes/index.tsx", `import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { ReportLayout } from "@/layouts/ReportLayout";
import { EmptyLayout } from "@/layouts/EmptyLayout";
import { ProtectedRoute } from "./protected";
import { PublicOnly } from "./public";

import LandingPage from "@/pages/Landing";
import PricingPage from "@/pages/Pricing";
import AboutPage from "@/pages/About";
import DownloadPage from "@/pages/Download";
import BlogPage from "@/pages/Blog";
import DocsPage from "@/pages/Docs";
import ChangelogPage from "@/pages/Changelog";
import ContactPage from "@/pages/Contact";
import PrivacyPage from "@/pages/Privacy";
import TermsPage from "@/pages/Terms";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import VerifyEmailPage from "@/pages/VerifyEmail";
import ForgotPasswordPage from "@/pages/ForgotPassword";
import DashboardPage from "@/pages/Dashboard";
import WorkspacePage from "@/pages/Workspace";
import ReportsPage from "@/pages/Reports";
import SnapshotsPage from "@/pages/Snapshots";
import ReportViewerPage from "@/pages/ReportViewer";
import ActivityPage from "@/pages/Activity";
import AnalyticsPage from "@/pages/Analytics";
import NotificationsPage from "@/pages/Notifications";
import BackupsPage from "@/pages/Backups";
import DevicesPage from "@/pages/Devices";
import TeamPage from "@/pages/Team";
import BillingPage from "@/pages/Billing";
import SettingsPage from "@/pages/Settings";
import ProfilePage from "@/pages/Profile";
import ApiKeysPage from "@/pages/ApiKeys";
import HelpCenterPage from "@/pages/HelpCenter";
import FeedbackPage from "@/pages/Feedback";
import NotFoundPage from "@/pages/NotFound";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="download" element={<DownloadPage />} />
        <Route path="blog" element={<BlogPage />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="changelog" element={<ChangelogPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      <Route
        path="app"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="workspaces" element={<WorkspacePage />} />
        <Route path="workspaces/:id" element={<WorkspacePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="snapshots" element={<SnapshotsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="backups" element={<BackupsPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="help" element={<HelpCenterPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
      </Route>

      <Route element={<ReportLayout />}>
        <Route path="r/:id" element={<ReportViewerPage />} />
      </Route>

      <Route element={<EmptyLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="home" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
`);

// app bootstrap
write("src/app/config.ts", `import { APP_CONFIG, ROUTES } from "@researchmind/config";
import { env } from "@/lib/env";

export const appConfig = {
  ...APP_CONFIG,
  env,
  routes: ROUTES,
};
`);

write("src/app/theme.ts", `export { themeTokens } from "@/theme";
`);

write("src/app/providers.tsx", `import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
`);

write("src/app/router.tsx", `export { AppRoutes as AppRouter } from "@/routes";
`);

write("src/app/App.tsx", `import React from "react";
import { AppRoutes } from "@/routes";

export default function App() {
  return <AppRoutes />;
}
`);

write("src/app/main.tsx", `import React from "react";
import ReactDOM from "react-dom/client";
import { AppProviders } from "./providers";
import App from "./App";
import "@/styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);
`);

// assets placeholders
write("src/assets/icons/.gitkeep", "");
write("src/assets/logos/.gitkeep", "");
write("src/assets/images/.gitkeep", "");
write("src/assets/illustrations/.gitkeep", "");
write("src/assets/fonts/.gitkeep", "");

// vite env types
write("src/vite-env.d.ts", `/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CLOUD_SYNC_URL: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_USE_MOCKS: string;
  readonly VITE_AUTH_REQUIRED: string;
  readonly VITE_DEFAULT_LOCALE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
`);

// Remove old flat App.tsx/main if they would conflict — keep cleaned by deleting later
console.log("Part 4 pages + routes done");
