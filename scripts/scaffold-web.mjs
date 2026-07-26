/**
 * ResearchMind Cloud — full apps/web scaffold with real working code.
 * Run: node scripts/scaffold-web.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const web = path.join(root, "apps", "web");

function write(rel, content) {
  const full = path.join(web, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r?\n/g, "\n"), "utf8");
  console.log("write", rel);
}

// ── tooling ──────────────────────────────────────────────
write("package.json", `{
  "name": "@researchmind/web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 3000",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 3000",
    "lint": "eslint .",
    "typecheck": "tsc -b --pretty false"
  },
  "dependencies": {
    "@researchmind/api": "workspace:*",
    "@researchmind/config": "workspace:*",
    "@researchmind/sync": "workspace:*",
    "@researchmind/types": "workspace:*",
    "@researchmind/ui": "workspace:*",
    "@researchmind/utils": "workspace:*",
    "axios": "^1.7.9",
    "clsx": "^2.1.1",
    "dayjs": "^1.11.13",
    "lucide-react": "^0.479.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.16.0",
    "postcss": "^8.4.49",
    "prettier": "^3.4.2",
    "tailwindcss": "^3.4.16",
    "typescript": "^5.7.2",
    "vite": "^5.4.11"
  }
}
`);

write("tsconfig.json", `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@researchmind/types": ["../../packages/types/src/index.ts"],
      "@researchmind/api": ["../../packages/api/src/index.ts"],
      "@researchmind/ui": ["../../packages/ui/src/index.ts"],
      "@researchmind/utils": ["../../packages/utils/src/index.ts"],
      "@researchmind/config": ["../../packages/config/src/index.ts"],
      "@researchmind/sync": ["../../packages/sync/src/index.ts"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
`);

write("tsconfig.node.json", `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
`);

write("vite.config.ts", `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@researchmind/types": path.resolve(__dirname, "../../packages/types/src"),
      "@researchmind/api": path.resolve(__dirname, "../../packages/api/src"),
      "@researchmind/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@researchmind/utils": path.resolve(__dirname, "../../packages/utils/src"),
      "@researchmind/config": path.resolve(__dirname, "../../packages/config/src"),
      "@researchmind/sync": path.resolve(__dirname, "../../packages/sync/src"),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
`);

write("tailwind.config.ts", `import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Outfit", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        surface: {
          DEFAULT: "#0f172a",
          deep: "#090d16",
          raised: "#1e293b",
        },
      },
      boxShadow: {
        glow: "0 0 40px -12px rgba(56, 189, 248, 0.35)",
      },
    },
  },
  plugins: [],
} satisfies Config;
`);

write("postcss.config.js", `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

write("eslint.config.js", `export default [
  {
    ignores: ["dist", "node_modules"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
];
`);

write("prettier.config.js", `/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
};
`);

write(".gitignore", `node_modules
dist
.DS_Store
*.local
.env
.env.*.local
.vite
coverage
`);

write(".env.example", `VITE_APP_NAME=ResearchMind Cloud
VITE_API_BASE_URL=https://researchmind.pages.dev/api/v1
VITE_CLOUD_SYNC_URL=http://localhost:8787/api
VITE_CLERK_PUBLISHABLE_KEY=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_USE_MOCKS=true
VITE_AUTH_REQUIRED=false
VITE_DEFAULT_LOCALE=en
`);

write(".env", `VITE_APP_NAME=ResearchMind Cloud
VITE_API_BASE_URL=https://researchmind.pages.dev/api/v1
VITE_CLOUD_SYNC_URL=http://localhost:8787/api
VITE_USE_MOCKS=true
VITE_AUTH_REQUIRED=false
VITE_DEFAULT_LOCALE=en
`);

write("index.html", `<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ResearchMind Cloud</title>
    <meta name="description" content="ResearchMind Cloud — workspaces, live reports, backups and collaboration for local-first research." />
    <meta name="theme-color" content="#090d16" />
    <link rel="icon" href="/favicon.ico" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-surface-deep text-slate-100 antialiased">
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
`);

write("README.md", `# ResearchMind Cloud Web

SaaS cloud platform for ResearchMind. Desktop remains the primary research IDE; this app provides cloud dashboard, public report hosting, backups, devices, team and billing surfaces.

## Stack

- React 18 + Vite + TypeScript
- React Router 6
- Zustand
- Tailwind CSS
- Shared monorepo packages: \`@researchmind/{types,api,ui,utils,config,sync}\`

## Develop

\`\`\`bash
# from monorepo root (pnpm workspaces)
pnpm install
pnpm --filter @researchmind/web dev
\`\`\`

Or from this folder after install:

\`\`\`bash
npm run dev
\`\`\`

Open http://localhost:3000

## Env

Copy \`.env.example\` → \`.env\`. With \`VITE_USE_MOCKS=true\` the app runs fully offline using seed data.

## MVP routes

- \`/\` Landing
- \`/login\` Auth
- \`/app\` Dashboard
- \`/app/workspaces\` Workspace list
- \`/app/reports\` Report center
- \`/r/:id\` Public report viewer
- \`/app/profile\` Profile
- \`/app/settings\` Settings
`);

// public
write("public/manifest.json", JSON.stringify({
  name: "ResearchMind Cloud",
  short_name: "ResearchMind",
  start_url: "/",
  display: "standalone",
  background_color: "#090d16",
  theme_color: "#090d16",
  icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml" }],
}, null, 2));

write("public/robots.txt", `User-agent: *
Allow: /
Sitemap: https://researchmind.pages.dev/sitemap.xml
`);

write("public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://researchmind.pages.dev/</loc></url>
  <url><loc>https://researchmind.pages.dev/pricing</loc></url>
  <url><loc>https://researchmind.pages.dev/download</loc></url>
  <url><loc>https://researchmind.pages.dev/docs</loc></url>
  <url><loc>https://researchmind.pages.dev/blog</loc></url>
</urlset>
`);

write("public/_redirects", `/*    /index.html   200
`);

write("public/offline.html", `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Offline — ResearchMind</title>
<style>body{font-family:system-ui;background:#090d16;color:#f1f5f9;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:420px;padding:2rem;border:1px solid #1e293b;border-radius:16px;background:#0f172a;text-align:center}
</style></head><body><div class="card"><h1>You're offline</h1><p>ResearchMind Cloud needs a connection for this page. Desktop works offline.</p></div></body></html>
`);

write("public/report.html", `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Report — ResearchMind</title>
<meta http-equiv="refresh" content="0;url=/" /></head>
<body>Redirecting to ResearchMind Cloud…</body></html>
`);

write("public/logo.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <path d="M18 40V24l14 16 14-16v16" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <defs><linearGradient id="g" x1="0" y1="0" x2="64" y2="64"><stop stop-color="#06b6d4"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
</svg>
`);

// minimal 1x1 ico placeholder as SVG renamed - browsers accept svg favicon via link; also write favicon as svg copy
write("public/favicon.ico", ""); // empty placeholder; index uses logo via link fallback
// better: point favicon to logo in index - already have logo.svg

write("public/locales/en/translation.json", JSON.stringify({
  app: { name: "ResearchMind Cloud", tagline: "Local-first research + cloud collaboration" },
  nav: { dashboard: "Dashboard", workspaces: "Workspaces", reports: "Reports", settings: "Settings" },
  auth: { login: "Sign in", register: "Create account", logout: "Sign out" },
  common: { loading: "Loading…", save: "Save", cancel: "Cancel", search: "Search" },
}, null, 2));

write("public/locales/vi/translation.json", JSON.stringify({
  app: { name: "ResearchMind Cloud", tagline: "Nghiên cứu local-first + cộng tác trên mây" },
  nav: { dashboard: "Tổng quan", workspaces: "Workspace", reports: "Báo cáo", settings: "Cài đặt" },
  auth: { login: "Đăng nhập", register: "Tạo tài khoản", logout: "Đăng xuất" },
  common: { loading: "Đang tải…", save: "Lưu", cancel: "Hủy", search: "Tìm kiếm" },
}, null, 2));

write("public/images/.gitkeep", "");

// ── styles ───────────────────────────────────────────────
write("src/styles/globals.css", `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

html, body, #root {
  min-height: 100%;
}

body {
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(14, 165, 233, 0.12), transparent 55%),
    radial-gradient(900px 500px at 90% 0%, rgba(99, 102, 241, 0.10), transparent 50%),
    #090d16;
}

@layer components {
  .page-title {
    @apply font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl;
  }
  .page-subtitle {
    @apply mt-1 text-sm text-slate-400;
  }
  .surface-card {
    @apply rounded-2xl border border-slate-800 bg-slate-900/80;
  }
  .link-muted {
    @apply text-slate-400 transition hover:text-sky-300;
  }
  .focus-ring {
    @apply outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40;
  }
}
`);

// ── lib ──────────────────────────────────────────────────
write("src/lib/env.ts", `export const env = {
  appName: import.meta.env.VITE_APP_NAME || "ResearchMind Cloud",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "https://researchmind.pages.dev/api/v1",
  cloudSyncUrl: import.meta.env.VITE_CLOUD_SYNC_URL || "http://localhost:8787/api",
  clerkKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "",
  useMocks: String(import.meta.env.VITE_USE_MOCKS ?? "true") !== "false",
  authRequired: String(import.meta.env.VITE_AUTH_REQUIRED ?? "false") === "true",
  defaultLocale: (import.meta.env.VITE_DEFAULT_LOCALE || "en") as "en" | "vi",
  isDev: import.meta.env.DEV,
};
`);

write("src/lib/logger.ts", `import { env } from "./env";

type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, message: string, meta?: unknown) {
  if (!env.isDev && level === "debug") return;
  const payload = meta === undefined ? [message] : [message, meta];
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](\`[RM]\`, ...payload);
}

export const logger = {
  debug: (m: string, meta?: unknown) => log("debug", m, meta),
  info: (m: string, meta?: unknown) => log("info", m, meta),
  warn: (m: string, meta?: unknown) => log("warn", m, meta),
  error: (m: string, meta?: unknown) => log("error", m, meta),
};
`);

write("src/lib/axios.ts", `import axios from "axios";
import { env } from "./env";

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 20_000,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("rm_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = \`Bearer \${token}\`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      localStorage.removeItem("rm_token");
    }
    return Promise.reject(error);
  },
);
`);

write("src/lib/dayjs.ts", `import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/vi";
import "dayjs/locale/en";

dayjs.extend(relativeTime);

export function setDayjsLocale(locale: "en" | "vi") {
  dayjs.locale(locale);
}

export { dayjs };
`);

write("src/lib/analytics.ts", `import { logger } from "./logger";

export function track(event: string, props?: Record<string, unknown>) {
  logger.debug(\`analytics:\${event}\`, props);
  // Plausible / custom analytics hook point
  if (typeof window !== "undefined" && (window as any).plausible) {
    (window as any).plausible(event, { props });
  }
}
`);

write("src/lib/clerk.ts", `/**
 * Clerk integration stub.
 * Wire VITE_CLERK_PUBLISHABLE_KEY and wrap Providers with ClerkProvider when ready.
 */
import { env } from "./env";

export const clerkConfig = {
  publishableKey: env.clerkKey,
  enabled: Boolean(env.clerkKey),
};

export async function getClerkToken(): Promise<string | null> {
  // Replace with real Clerk session.getToken() once enabled
  return localStorage.getItem("rm_token");
}
`);

write("src/lib/firebase.ts", `/**
 * Firebase optional auth / analytics stub for hosted deployments.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId,
);
`);

// ── mocks ────────────────────────────────────────────────
write("src/mocks/data.ts", `import type {
  ActivityItem,
  AnalyticsSummary,
  ApiKey,
  BackupRecord,
  BillingPlan,
  Device,
  NotificationItem,
  Report,
  Snapshot,
  TeamMember,
  User,
  UserSettings,
  Workspace,
} from "@researchmind/types";

export const mockUser: User = {
  id: "user_demo",
  email: "researcher@researchmind.app",
  name: "Researcher Pro",
  avatarUrl: undefined,
  plan: "pro",
  emailVerified: true,
  createdAt: "2025-11-01T08:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
};

export const mockWorkspaces: Workspace[] = [
  {
    id: "ws_main",
    name: "Main Workspace",
    description: "Primary research library synced from Desktop",
    ownerUid: mockUser.id,
    syncState: "Synced",
    paperCount: 11,
    reportCount: 3,
    memberCount: 1,
    createdAt: "2025-12-01T00:00:00.000Z",
    updatedAt: "2026-07-25T08:10:00.000Z",
  },
  {
    id: "ws_ai_research",
    name: "AI Research 2026",
    description: "LLM evaluation & literature synthesis",
    ownerUid: mockUser.id,
    syncState: "Backup Available",
    paperCount: 24,
    reportCount: 5,
    memberCount: 2,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-07-25T07:00:00.000Z",
  },
  {
    id: "ws_medical_review",
    name: "Systematic Review 2025",
    description: "Medical systematic review pipeline",
    ownerUid: mockUser.id,
    syncState: "Local Only",
    paperCount: 42,
    reportCount: 2,
    memberCount: 1,
    createdAt: "2025-09-10T00:00:00.000Z",
    updatedAt: "2026-07-24T18:00:00.000Z",
  },
];

export const mockReports: Report[] = [
  {
    id: "ws_main",
    workspaceId: "ws_main",
    title: "AI Research Overview Report",
    type: "Live Report",
    url: "https://researchmind.pages.dev/r/ws_main",
    visibility: "public",
    version: 3,
    summary: "Live cloud report bound to Main Workspace.",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-07-25T08:10:00.000Z",
  },
  {
    id: "rpt_zR3NvlbYqm9c",
    workspaceId: "ws_ai_research",
    title: "Snapshot · Release 1.0",
    type: "Snapshot",
    url: "https://researchmind.pages.dev/r/rpt_zR3NvlbYqm9c",
    visibility: "unlisted",
    version: 1,
    summary: "Frozen snapshot for peer review.",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  },
  {
    id: "rpt_medical_v2",
    workspaceId: "ws_medical_review",
    title: "PRISMA Draft Report",
    type: "Live Report",
    url: "https://researchmind.pages.dev/r/rpt_medical_v2",
    visibility: "private",
    version: 2,
    summary: "Internal medical review draft.",
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-07-22T12:00:00.000Z",
  },
];

export const mockSnapshots: Snapshot[] = [
  {
    id: "snap_001",
    reportId: "rpt_zR3NvlbYqm9c",
    workspaceId: "ws_ai_research",
    title: "Release 1.0 freeze",
    version: 1,
    url: "https://researchmind.pages.dev/r/rpt_zR3NvlbYqm9c",
    note: "Shared with external reviewers",
    createdAt: "2026-07-20T00:00:00.000Z",
  },
];

export const mockActivity: ActivityItem[] = [
  {
    id: "act_1",
    type: "report_published",
    title: "Published cloud report",
    detail: "Main Workspace live report updated to v3",
    workspaceId: "ws_main",
    actorName: "Researcher Pro",
    timestamp: "2026-07-25T08:10:00.000Z",
  },
  {
    id: "act_2",
    type: "backup_created",
    title: "Automatic cloud backup",
    detail: "Settings & prompts backup completed",
    timestamp: "2026-07-25T07:00:00.000Z",
  },
  {
    id: "act_3",
    type: "workspace_updated",
    title: "Metadata synced",
    detail: "11 documents synced from Desktop App",
    workspaceId: "ws_main",
    timestamp: "2026-07-25T05:00:00.000Z",
  },
  {
    id: "act_4",
    type: "device_linked",
    title: "Device linked",
    detail: "ResearchMind Desktop on Windows",
    timestamp: "2026-07-24T20:00:00.000Z",
  },
];

export const mockBackups: BackupRecord[] = [
  {
    id: "bak_1",
    workspaceId: "ws_main",
    type: "workspace",
    name: "Auto-Backup Workspace Main",
    sizeBytes: 1_250_000,
    createdAt: "2026-07-25T07:00:00.000Z",
    status: "completed",
  },
  {
    id: "bak_2",
    workspaceId: "ws_ai_research",
    type: "settings",
    name: "Settings snapshot",
    sizeBytes: 42_000,
    createdAt: "2026-07-20T09:00:00.000Z",
    status: "completed",
  },
];

export const mockNotifications: NotificationItem[] = [
  {
    id: "n1",
    kind: "sync",
    title: "Desktop connected",
    body: "ResearchMind Desktop is syncing metadata.",
    read: false,
    href: "/app/devices",
    createdAt: "2026-07-25T08:00:00.000Z",
  },
  {
    id: "n2",
    kind: "success",
    title: "Backup completed",
    body: "Main Workspace backup finished successfully.",
    read: false,
    href: "/app/backups",
    createdAt: "2026-07-25T07:05:00.000Z",
  },
  {
    id: "n3",
    kind: "billing",
    title: "Pro plan active",
    body: "Your Pro subscription renews next month.",
    read: true,
    href: "/app/billing",
    createdAt: "2026-07-01T00:00:00.000Z",
  },
];

export const mockDevices: Device[] = [
  {
    id: "dev_desktop",
    name: "Windows Desktop",
    platform: "desktop",
    lastSeenAt: "2026-07-25T08:05:00.000Z",
    current: false,
    trusted: true,
  },
  {
    id: "dev_web",
    name: "Chrome · Cloud Web",
    platform: "web",
    lastSeenAt: new Date().toISOString(),
    current: true,
    trusted: true,
  },
];

export const mockMembers: TeamMember[] = [
  {
    id: "tm_1",
    userId: mockUser.id,
    workspaceId: "ws_ai_research",
    name: mockUser.name,
    email: mockUser.email,
    role: "owner",
    joinedAt: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "tm_2",
    userId: "user_collab",
    workspaceId: "ws_ai_research",
    name: "Alex Reviewer",
    email: "alex@lab.edu",
    role: "reviewer",
    joinedAt: "2026-03-01T00:00:00.000Z",
  },
];

export const mockPlans: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    currency: "USD",
    features: ["1 workspace", "5 public reports", "Desktop local-first", "Community support"],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 4,
    currency: "USD",
    highlighted: true,
    features: ["10 workspaces", "100 reports", "Cloud backups", "Devices", "Priority support"],
  },
  {
    id: "lab",
    name: "Lab",
    priceMonthly: 12,
    currency: "USD",
    features: ["50 workspaces", "Team collaboration", "API keys", "Audit logs", "Shared reviews"],
  },
];

export const mockSettings: UserSettings = {
  theme: "dark",
  locale: "en",
  emailNotifications: true,
  weeklyDigest: true,
  autoBackup: true,
  defaultVisibility: "unlisted",
};

export const mockAnalytics: AnalyticsSummary = {
  workspaces: 3,
  reports: 8,
  snapshots: 3,
  papers: 77,
  storageMb: 1.2,
  activityLast7d: 24,
  syncHealth: 98,
};

export const mockApiKeys: ApiKey[] = [
  {
    id: "key_1",
    name: "CI publish",
    prefix: "rm_live_ab12",
    createdAt: "2026-06-01T00:00:00.000Z",
    lastUsedAt: "2026-07-20T00:00:00.000Z",
    scopes: ["reports:write", "reports:read"],
  },
];
`);

// Continue in next part of script - services, store, etc.
console.log("Part 1 tooling + mocks done");
