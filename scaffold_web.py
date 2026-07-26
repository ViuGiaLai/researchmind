import os

base_dir = r"d:\all_my_project\researchmind\apps\web"

files = {
    # Public folder
    "public/favicon.ico": "",
    "public/logo.svg": '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-brain"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/></svg>''',
    "public/manifest.json": '''{
  "name": "ResearchMind Cloud",
  "short_name": "ResearchMind",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#ffffff",
  "description": "Your research intelligence platform."
}''',
    "public/robots.txt": "User-agent: *\nAllow: /",
    "public/sitemap.xml": "",
    "public/offline.html": "<h1>Offline</h1>",
    "public/report.html": "<h1>Report</h1>",
    "public/_redirects": "/* /index.html 200",

    # Configs
    "tailwind.config.ts": '''/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}''',
    "postcss.config.js": '''export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}''',
    
    # Assets
    "src/assets/globals.css": '''@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-slate-50 text-slate-900;
  }
}''',

    # App
    "src/app/main.tsx": '''import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../assets/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);''',
    "src/app/App.tsx": '''import React from 'react';
import { Providers } from './providers';
import { AppRouter } from './router';

export default function App() {
  return (
    <Providers>
      <AppRouter />
    </Providers>
  );
}''',
    "src/app/providers.tsx": '''import React from 'react';
import { ClerkProvider } from '@clerk/clerk-react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_placeholder";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}''',
    "src/app/router.tsx": '''import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { PublicLayout } from '../components/layout/PublicLayout';

// Pages
import LandingPage from '../pages/(public)/landing';
import PricingPage from '../pages/(public)/pricing';
import PublicReportView from '../pages/(public)/r/[id]';

import SignInPage from '../pages/(auth)/sign-in';
import SignUpPage from '../pages/(auth)/sign-up';

import DashboardHome from '../pages/(dashboard)/home';
import Workspaces from '../pages/(dashboard)/workspaces';
import WorkspaceDetail from '../pages/(dashboard)/workspaces/[id]';
import Reports from '../pages/(dashboard)/reports';
import Usage from '../pages/(dashboard)/usage';
import Settings from '../pages/(dashboard)/settings';
import NotFound from '../pages/not-found';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/r/:id" element={<PublicReportView />} />
        </Route>

        {/* Auth Routes */}
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />

        {/* Dashboard Routes */}
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
          <Route path="workspaces" element={<Workspaces />} />
          <Route path="workspaces/:id" element={<WorkspaceDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="usage" element={<Usage />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}''',
    "src/app/theme.ts": "export const theme = {};",
    "src/app/config.ts": "export const config = {};",

    # Components - Layout
    "src/components/layout/PublicLayout.tsx": '''import { Outlet, Link } from 'react-router-dom';
import { Brain } from 'lucide-react';

export function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white py-4 px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold">
          <Brain className="w-6 h-6 text-blue-600" />
          ResearchMind Cloud
        </Link>
        <div className="flex gap-4">
          <Link to="/pricing" className="text-slate-600 hover:text-slate-900">Pricing</Link>
          <Link to="/app" className="text-blue-600 font-medium">Go to App</Link>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}''',
    "src/components/layout/DashboardLayout.tsx": '''import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function DashboardLayout() {
  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}''',
    "src/components/layout/Sidebar.tsx": '''import { Link, useLocation } from 'react-router-dom';
import { Home, Folder, FileText, Settings, Activity, Brain } from 'lucide-react';

export function Sidebar() {
  const location = useLocation();
  const links = [
    { to: '/app', icon: Home, label: 'Home' },
    { to: '/app/workspaces', icon: Folder, label: 'Workspaces' },
    { to: '/app/reports', icon: FileText, label: 'Reports' },
    { to: '/app/usage', icon: Activity, label: 'Usage & AI' },
    { to: '/app/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-64 bg-white border-r flex flex-col">
      <div className="p-6 flex items-center gap-2 font-bold text-xl border-b">
        <Brain className="w-6 h-6 text-blue-600" />
        RM Cloud
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {links.map(link => {
          const Icon = link.icon;
          const isActive = location.pathname === link.to;
          return (
            <Link key={link.to} to={link.to} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon className="w-5 h-5" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}''',

    # Components - Shared
    "src/components/shared/Button.tsx": '''import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Button({ className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' }) {
  const base = "px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-slate-200 text-slate-900 hover:bg-slate-300",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50"
  };
  return <button className={cn(base, variants[variant], className)} {...props} />;
}''',
    "src/components/shared/Card.tsx": '''import React from 'react';
export function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>{children}</div>;
}''',

    # Components - Workspace
    "src/components/workspace/WorkspaceCard.tsx": '''import { Link } from 'react-router-dom';
import { Folder, Cloud } from 'lucide-react';
export function WorkspaceCard({ workspace }: { workspace: any }) {
  return (
    <Link to={`/app/workspaces/${workspace.id}`} className="block">
      <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-4">
          <Folder className="w-8 h-8 text-blue-500" />
          <Cloud className="w-5 h-5 text-green-500" />
        </div>
        <h3 className="font-semibold text-lg">{workspace.name}</h3>
        <p className="text-sm text-slate-500">{workspace.paperCount || 0} papers</p>
      </div>
    </Link>
  );
}''',
    
    # Components - Report
    "src/components/report/ReportCard.tsx": '''export function ReportCard({ report }: { report: any }) {
  return (
    <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
      <h3 className="font-semibold text-lg">{report.title}</h3>
      <p className="text-sm text-slate-500 mt-2">{new Date(report.updatedAt).toLocaleDateString()}</p>
    </div>
  );
}''',

    # Pages - Auth
    "src/pages/(auth)/sign-in/index.tsx": '''import { SignIn } from '@clerk/clerk-react';
export default function SignInPage() {
  return <div className="flex justify-center items-center h-screen bg-slate-50"><SignIn /></div>;
}''',
    "src/pages/(auth)/sign-up/index.tsx": '''import { SignUp } from '@clerk/clerk-react';
export default function SignUpPage() {
  return <div className="flex justify-center items-center h-screen bg-slate-50"><SignUp /></div>;
}''',

    # Pages - Dashboard
    "src/pages/(dashboard)/home/index.tsx": '''import { Card } from '../../../components/shared/Card';
export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Welcome back</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-slate-500 font-medium">Workspaces</h3>
          <p className="text-3xl font-bold mt-2">12</p>
        </Card>
        <Card>
          <h3 className="text-slate-500 font-medium">Reports</h3>
          <p className="text-3xl font-bold mt-2">45</p>
        </Card>
        <Card>
          <h3 className="text-slate-500 font-medium">Storage</h3>
          <p className="text-3xl font-bold mt-2">1.2 GB</p>
        </Card>
      </div>
    </div>
  );
}''',
    "src/pages/(dashboard)/workspaces/index.tsx": '''import { WorkspaceCard } from '../../../components/workspace/WorkspaceCard';
export default function Workspaces() {
  const dummy = [{ id: '1', name: 'AI Research', paperCount: 24 }, { id: '2', name: 'Biology Notes', paperCount: 8 }];
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Workspaces</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {dummy.map(w => <WorkspaceCard key={w.id} workspace={w} />)}
      </div>
    </div>
  );
}''',
    "src/pages/(dashboard)/workspaces/[id]/index.tsx": '''import { useParams } from 'react-router-dom';
export default function WorkspaceDetail() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Workspace: {id}</h1>
      <p className="text-slate-600">Sync status, configuration, and shared members go here.</p>
    </div>
  );
}''',
    "src/pages/(dashboard)/reports/index.tsx": '''import { ReportCard } from '../../../components/report/ReportCard';
export default function Reports() {
  const dummy = [{ id: '1', title: 'Q1 AI Trends', updatedAt: Date.now() }];
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {dummy.map(r => <ReportCard key={r.id} report={r} />)}
      </div>
    </div>
  );
}''',
    "src/pages/(dashboard)/usage/index.tsx": '''export default function Usage() {
  return <div><h1 className="text-3xl font-bold mb-6">Usage & AI</h1><p>Analytics go here.</p></div>;
}''',
    "src/pages/(dashboard)/settings/index.tsx": '''export default function Settings() {
  return <div><h1 className="text-3xl font-bold mb-6">Settings</h1><p>Account settings go here.</p></div>;
}''',

    # Pages - Public
    "src/pages/(public)/landing/index.tsx": '''import { Link } from 'react-router-dom';
import { Button } from '../../../components/shared/Button';
export default function LandingPage() {
  return (
    <div className="max-w-4xl mx-auto text-center py-32">
      <h1 className="text-6xl font-extrabold tracking-tight mb-6">Your Research, Supercharged</h1>
      <p className="text-xl text-slate-600 mb-10">Local-first desktop IDE powered by hybrid AI. Synced seamlessly to the cloud.</p>
      <Link to="/app">
        <Button variant="primary" className="text-lg px-8 py-3">Open Cloud Dashboard</Button>
      </Link>
    </div>
  );
}''',
    "src/pages/(public)/pricing/index.tsx": '''export default function PricingPage() {
  return <div className="text-center py-32"><h1 className="text-5xl font-bold">Pricing</h1></div>;
}''',
    "src/pages/(public)/r/[id]/index.tsx": '''import { useParams } from 'react-router-dom';
export default function PublicReportView() {
  const { id } = useParams();
  return <div className="max-w-3xl mx-auto py-16"><h1 className="text-4xl font-bold">Public Report {id}</h1></div>;
}''',
    "src/pages/not-found.tsx": '''import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold mb-4">404 - Not Found</h1>
      <Link to="/" className="text-blue-600 hover:underline">Go Home</Link>
    </div>
  );
}''',

    # Lib & Hooks & Store
    "src/lib/api-client.ts": "export const apiClient = {};",
    "src/lib/auth.ts": "export const auth = {};",
    "src/lib/utils.ts": "export const utils = {};",
    "src/lib/constants.ts": "export const constants = {};",
    
    "src/hooks/use-workspaces.ts": "export function useWorkspaces() { return []; }",
    "src/hooks/use-reports.ts": "export function useReports() { return []; }",
    "src/hooks/use-auth.ts": "export function useAuth() { return {}; }",
    "src/hooks/use-sync-status.ts": "export function useSyncStatus() { return 'Synced'; }",

    "src/store/ui-store.ts": "import { create } from 'zustand'; export const useUIStore = create(() => ({}));",
    "src/store/sync-store.ts": "import { create } from 'zustand'; export const useSyncStore = create(() => ({}));",
    
    "src/types/index.ts": "export type Workspace = { id: string; name: string; };"
}

for rel_path, content in files.items():
    full_path = os.path.join(base_dir, os.path.normpath(rel_path))
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Created: {rel_path}")

print("Scaffold complete!")
