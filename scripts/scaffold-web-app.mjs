/**
 * Part 2: app core, services, hooks, store, contexts, routes, layouts, components, pages
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

// utils
write("src/utils/format.ts", `export {
  formatDate,
  formatRelativeTime,
  formatBytes,
  formatCurrency,
  truncate,
} from "@researchmind/utils";
`);

write("src/utils/clipboard.ts", `export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}
`);

write("src/utils/download.ts", `export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadUrl(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}
`);

write("src/utils/validation.ts", `import { isValidEmail } from "@researchmind/utils";

export function validateLogin(email: string, password: string) {
  const errors: Record<string, string> = {};
  if (!isValidEmail(email)) errors.email = "Enter a valid email";
  if (!password || password.length < 6) errors.password = "Password must be at least 6 characters";
  return errors;
}

export function validateRegister(name: string, email: string, password: string) {
  const errors = validateLogin(email, password);
  if (!name.trim()) errors.name = "Name is required";
  return errors;
}
`);

write("src/utils/permissions.ts", `import type { MemberRole, PlanTier } from "@researchmind/types";
import { PLAN_LIMITS } from "@researchmind/config";

const roleRank: Record<MemberRole, number> = {
  viewer: 1,
  reviewer: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

export function can(role: MemberRole, min: MemberRole): boolean {
  return roleRank[role] >= roleRank[min];
}

export function planLimit(plan: PlanTier, key: keyof (typeof PLAN_LIMITS)["free"]) {
  return PLAN_LIMITS[plan][key];
}
`);

write("src/utils/constants.ts", `export const APP_SIDEBAR_WIDTH = 260;
export const TOKEN_KEY = "rm_token";
export const USER_KEY = "rm_user";
export const THEME_KEY = "rm_theme";
`);

write("src/utils/urls.ts", `import { APP_CONFIG } from "@researchmind/config";

export function publicReportUrl(id: string) {
  return \`\${APP_CONFIG.cloudUrl}/r/\${id}\`;
}

export function desktopDownloadUrl() {
  return "https://github.com/ViuGiaLai/researchmind/releases";
}
`);

write("src/utils/helpers.ts", `export function pluralize(n: number, one: string, many?: string) {
  return n === 1 ? one : many || \`\${one}s\`;
}

export function initials(name: string) {
  return name
    .split(/\\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}
`);

// types re-exports for app-local convenience
write("src/types/user.ts", `export type { User, UserSettings, PlanTier } from "@researchmind/types";
`);
write("src/types/workspace.ts", `export type { Workspace, SyncState } from "@researchmind/types";
`);
write("src/types/report.ts", `export type { Report, ReportType, Visibility } from "@researchmind/types";
`);
write("src/types/snapshot.ts", `export type { Snapshot } from "@researchmind/types";
`);
write("src/types/activity.ts", `export type { ActivityItem, ActivityType } from "@researchmind/types";
`);
write("src/types/backup.ts", `export type { BackupRecord, BackupStatus, BackupType } from "@researchmind/types";
`);
write("src/types/notification.ts", `export type { NotificationItem, NotificationKind } from "@researchmind/types";
`);
write("src/types/api.ts", `export type { ApiError, Paginated, ApiListResponse } from "@researchmind/types";
`);

// services
write("src/services/api.ts", `import { createCloudApiClient } from "@researchmind/api";
import { env } from "@/lib/env";
import { TOKEN_KEY } from "@/utils/constants";

export const apiClient = createCloudApiClient({
  baseUrl: env.apiBaseUrl,
  getToken: () => localStorage.getItem(TOKEN_KEY),
});

export { ApiError } from "@researchmind/api";
`);

write("src/services/auth.ts", `import type { User } from "@researchmind/types";
import { env } from "@/lib/env";
import { mockUser } from "@/mocks/data";
import { TOKEN_KEY, USER_KEY } from "@/utils/constants";
import { sleep } from "@researchmind/utils";

export async function login(email: string, _password: string): Promise<{ user: User; token: string }> {
  if (env.useMocks) {
    await sleep(400);
    const user = { ...mockUser, email };
    const token = "mock_token_" + Date.now();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return { user, token };
  }
  // Real endpoint placeholder
  throw new Error("Auth API not configured. Enable VITE_USE_MOCKS or wire Clerk.");
}

export async function register(name: string, email: string, password: string) {
  return login(email, password).then(({ user, token }) => ({
    user: { ...user, name },
    token,
  }));
}

export async function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export async function requestPasswordReset(email: string) {
  if (env.useMocks) {
    await sleep(400);
    return { ok: true, email };
  }
  throw new Error("Password reset API not configured");
}
`);

const serviceTemplate = (name, mockExport, listKey) => `import { env } from "@/lib/env";
import { apiClient } from "./api";
import { ${mockExport} } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

export async function list${name}() {
  if (env.useMocks) {
    await sleep(200);
    return { data: ${mockExport}, total: ${mockExport}.length };
  }
  return apiClient.${listKey}();
}
`;

write("src/services/workspace.ts", `import type { Workspace } from "@researchmind/types";
import { env } from "@/lib/env";
import { apiClient } from "./api";
import { mockWorkspaces } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

export async function listWorkspaces() {
  if (env.useMocks) {
    await sleep(200);
    return { data: mockWorkspaces, total: mockWorkspaces.length };
  }
  return apiClient.listWorkspaces();
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  if (env.useMocks) {
    await sleep(150);
    return mockWorkspaces.find((w) => w.id === id);
  }
  return apiClient.getWorkspace(id);
}
`);

write("src/services/reports.ts", `import type { Report } from "@researchmind/types";
import { env } from "@/lib/env";
import { apiClient } from "./api";
import { mockReports } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

export async function listReports() {
  if (env.useMocks) {
    await sleep(200);
    return { data: mockReports, total: mockReports.length };
  }
  return apiClient.listReports();
}

export async function getReport(id: string): Promise<Report | undefined> {
  if (env.useMocks) {
    await sleep(150);
    return mockReports.find((r) => r.id === id);
  }
  return apiClient.getReport(id);
}
`);

write("src/services/snapshots.ts", `import { env } from "@/lib/env";
import { apiClient } from "./api";
import { mockSnapshots } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

export async function listSnapshots() {
  if (env.useMocks) {
    await sleep(200);
    return { data: mockSnapshots, total: mockSnapshots.length };
  }
  return apiClient.listSnapshots();
}
`);

write("src/services/analytics.ts", `import { env } from "@/lib/env";
import { apiClient } from "./api";
import { mockAnalytics } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

export async function getAnalytics() {
  if (env.useMocks) {
    await sleep(200);
    return mockAnalytics;
  }
  return apiClient.getAnalytics();
}
`);

write("src/services/backups.ts", `import type { BackupRecord } from "@researchmind/types";
import { env } from "@/lib/env";
import { apiClient } from "./api";
import { mockBackups } from "@/mocks/data";
import { generateId, sleep } from "@researchmind/utils";

export async function listBackups() {
  if (env.useMocks) {
    await sleep(200);
    return { data: mockBackups, total: mockBackups.length };
  }
  return apiClient.listBackups();
}

export async function createBackup(input: Partial<BackupRecord>) {
  if (env.useMocks) {
    await sleep(500);
    const record: BackupRecord = {
      id: generateId("bak"),
      workspaceId: input.workspaceId || "ws_main",
      type: input.type || "workspace",
      name: input.name || "Manual backup",
      sizeBytes: input.sizeBytes || 1_000_000,
      createdAt: new Date().toISOString(),
      status: "completed",
    };
    mockBackups.unshift(record);
    return record;
  }
  return apiClient.createBackup(input);
}
`);

write("src/services/activity.ts", `import { env } from "@/lib/env";
import { apiClient } from "./api";
import { mockActivity } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

export async function listActivity() {
  if (env.useMocks) {
    await sleep(200);
    return { data: mockActivity, total: mockActivity.length };
  }
  return apiClient.listActivity();
}
`);

write("src/services/notifications.ts", `import { env } from "@/lib/env";
import { apiClient } from "./api";
import { mockNotifications } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

export async function listNotifications() {
  if (env.useMocks) {
    await sleep(150);
    return { data: mockNotifications, total: mockNotifications.length };
  }
  return apiClient.listNotifications();
}

export async function markAllRead() {
  if (env.useMocks) {
    mockNotifications.forEach((n) => {
      n.read = true;
    });
    return { ok: true };
  }
  return { ok: true };
}
`);

write("src/services/billing.ts", `import { env } from "@/lib/env";
import { mockPlans, mockUser } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

export async function listPlans() {
  if (env.useMocks) {
    await sleep(150);
    return { data: mockPlans, current: mockUser.plan };
  }
  return { data: mockPlans, current: mockUser.plan };
}
`);

write("src/services/devices.ts", `import { env } from "@/lib/env";
import { mockDevices } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

export async function listDevices() {
  if (env.useMocks) {
    await sleep(150);
    return { data: mockDevices, total: mockDevices.length };
  }
  return { data: mockDevices, total: mockDevices.length };
}
`);

write("src/services/settings.ts", `import type { UserSettings } from "@researchmind/types";
import { env } from "@/lib/env";
import { mockSettings } from "@/mocks/data";
import { sleep } from "@researchmind/utils";

let settings: UserSettings = { ...mockSettings };

export async function getSettings() {
  if (env.useMocks) {
    await sleep(100);
    return settings;
  }
  return settings;
}

export async function updateSettings(patch: Partial<UserSettings>) {
  await sleep(200);
  settings = { ...settings, ...patch };
  return settings;
}
`);

write("src/services/upload.ts", `export async function uploadFile(file: File): Promise<{ url: string; name: string; size: number }> {
  // Placeholder — cloud upload endpoint later
  return {
    url: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
  };
}
`);

write("src/services/download.ts", `import { downloadText, downloadUrl } from "@/utils/download";

export { downloadText, downloadUrl };
`);

// stores
write("src/store/auth.store.ts", `import { create } from "zustand";
import type { User } from "@researchmind/types";
import * as authService from "@/services/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  hydrate: () => void;
  setSession: (user: User, token: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  hydrated: false,
  hydrate: () => {
    set({
      user: authService.getStoredUser(),
      token: authService.getToken(),
      hydrated: true,
    });
  },
  setSession: (user, token) => set({ user, token }),
  clear: () => set({ user: null, token: null }),
}));
`);

write("src/store/workspace.store.ts", `import { create } from "zustand";
import type { Workspace } from "@researchmind/types";
import { listWorkspaces } from "@/services/workspace";

interface WorkspaceState {
  items: Workspace[];
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  items: [],
  loading: false,
  error: null,
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const res = await listWorkspaces();
      set({ items: res.data, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to load", loading: false });
    }
  },
}));
`);

write("src/store/report.store.ts", `import { create } from "zustand";
import type { Report } from "@researchmind/types";
import { listReports } from "@/services/reports";

interface ReportState {
  items: Report[];
  loading: boolean;
  fetchAll: () => Promise<void>;
}

export const useReportStore = create<ReportState>((set) => ({
  items: [],
  loading: false,
  fetchAll: async () => {
    set({ loading: true });
    const res = await listReports();
    set({ items: res.data, loading: false });
  },
}));
`);

write("src/store/activity.store.ts", `import { create } from "zustand";
import type { ActivityItem } from "@researchmind/types";
import { listActivity } from "@/services/activity";

interface ActivityState {
  items: ActivityItem[];
  loading: boolean;
  fetchAll: () => Promise<void>;
}

export const useActivityStore = create<ActivityState>((set) => ({
  items: [],
  loading: false,
  fetchAll: async () => {
    set({ loading: true });
    const res = await listActivity();
    set({ items: res.data, loading: false });
  },
}));
`);

write("src/store/backup.store.ts", `import { create } from "zustand";
import type { BackupRecord } from "@researchmind/types";
import { createBackup, listBackups } from "@/services/backups";

interface BackupState {
  items: BackupRecord[];
  loading: boolean;
  fetchAll: () => Promise<void>;
  create: (input?: Partial<BackupRecord>) => Promise<void>;
}

export const useBackupStore = create<BackupState>((set, get) => ({
  items: [],
  loading: false,
  fetchAll: async () => {
    set({ loading: true });
    const res = await listBackups();
    set({ items: res.data, loading: false });
  },
  create: async (input) => {
    const record = await createBackup(input || {});
    set({ items: [record, ...get().items] });
  },
}));
`);

write("src/store/notification.store.ts", `import { create } from "zustand";
import type { NotificationItem } from "@researchmind/types";
import { listNotifications, markAllRead } from "@/services/notifications";

interface NotificationState {
  items: NotificationItem[];
  loading: boolean;
  fetchAll: () => Promise<void>;
  markAll: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  loading: false,
  fetchAll: async () => {
    set({ loading: true });
    const res = await listNotifications();
    set({ items: res.data, loading: false });
  },
  markAll: async () => {
    await markAllRead();
    set({ items: get().items.map((n) => ({ ...n, read: true })) });
  },
}));
`);

write("src/store/settings.store.ts", `import { create } from "zustand";
import type { UserSettings } from "@researchmind/types";
import { getSettings, updateSettings } from "@/services/settings";

interface SettingsState {
  settings: UserSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  save: (patch: Partial<UserSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  load: async () => {
    set({ loading: true });
    const settings = await getSettings();
    set({ settings, loading: false });
  },
  save: async (patch) => {
    const settings = await updateSettings(patch);
    set({ settings });
  },
}));
`);

// hooks
write("src/hooks/useAuth.ts", `import { useCallback } from "react";
import { useAuthStore } from "@/store/auth.store";
import * as authService from "@/services/auth";
import { track } from "@/lib/analytics";

export function useAuth() {
  const { user, token, hydrated, hydrate, setSession, clear } = useAuthStore();

  const login = useCallback(async (email: string, password: string) => {
    const res = await authService.login(email, password);
    setSession(res.user, res.token);
    track("login");
    return res.user;
  }, [setSession]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await authService.register(name, email, password);
    setSession(res.user, res.token);
    track("register");
    return res.user;
  }, [setSession]);

  const logout = useCallback(async () => {
    await authService.logout();
    clear();
    track("logout");
  }, [clear]);

  return {
    user,
    token,
    isAuthenticated: Boolean(user && token),
    hydrated,
    hydrate,
    login,
    register,
    logout,
  };
}
`);

write("src/hooks/useWorkspace.ts", `import { useEffect } from "react";
import { useWorkspaceStore } from "@/store/workspace.store";

export function useWorkspace() {
  const { items, loading, error, fetchAll } = useWorkspaceStore();
  useEffect(() => {
    if (!items.length && !loading) void fetchAll();
  }, [items.length, loading, fetchAll]);
  return { workspaces: items, loading, error, refresh: fetchAll };
}
`);

write("src/hooks/useReports.ts", `import { useEffect } from "react";
import { useReportStore } from "@/store/report.store";

export function useReports() {
  const { items, loading, fetchAll } = useReportStore();
  useEffect(() => {
    if (!items.length && !loading) void fetchAll();
  }, [items.length, loading, fetchAll]);
  return { reports: items, loading, refresh: fetchAll };
}
`);

write("src/hooks/useActivity.ts", `import { useEffect } from "react";
import { useActivityStore } from "@/store/activity.store";

export function useActivity() {
  const { items, loading, fetchAll } = useActivityStore();
  useEffect(() => {
    if (!items.length && !loading) void fetchAll();
  }, [items.length, loading, fetchAll]);
  return { activity: items, loading, refresh: fetchAll };
}
`);

write("src/hooks/useBackups.ts", `import { useEffect } from "react";
import { useBackupStore } from "@/store/backup.store";

export function useBackups() {
  const { items, loading, fetchAll, create } = useBackupStore();
  useEffect(() => {
    if (!items.length && !loading) void fetchAll();
  }, [items.length, loading, fetchAll]);
  return { backups: items, loading, refresh: fetchAll, createBackup: create };
}
`);

write("src/hooks/useNotifications.ts", `import { useEffect } from "react";
import { useNotificationStore } from "@/store/notification.store";

export function useNotifications() {
  const { items, loading, fetchAll, markAll } = useNotificationStore();
  useEffect(() => {
    if (!items.length && !loading) void fetchAll();
  }, [items.length, loading, fetchAll]);
  const unread = items.filter((n) => !n.read).length;
  return { notifications: items, loading, unread, refresh: fetchAll, markAll };
}
`);

write("src/hooks/useTheme.ts", `import { useEffect, useState } from "react";
import { THEME_KEY } from "@/utils/constants";

export type ThemeMode = "dark" | "light" | "system";

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(
    () => (localStorage.getItem(THEME_KEY) as ThemeMode) || "dark",
  );

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = theme === "dark" || (theme === "system" && prefersDark);
    root.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return { theme, setTheme: setThemeState };
}
`);

write("src/hooks/useClipboard.ts", `import { useCallback, useState } from "react";
import { copyToClipboard } from "@/utils/clipboard";

export function useClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), resetMs);
    }
    return ok;
  }, [resetMs]);

  return { copied, copy };
}
`);

// contexts
write("src/contexts/AuthContext.tsx", `import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@researchmind/types";

type AuthContextValue = ReturnType<typeof useAuth>;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  useEffect(() => {
    auth.hydrate();
  }, [auth.hydrate]);

  const value = useMemo(() => auth, [auth]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}

export type { User };
`);

write("src/contexts/ThemeContext.tsx", `import React, { createContext, useContext } from "react";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";

const ThemeContext = createContext<ReturnType<typeof useTheme> | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}

export type { ThemeMode };
`);

write("src/contexts/WorkspaceContext.tsx", `import React, { createContext, useContext, useMemo, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { Workspace } from "@researchmind/types";

const WorkspaceContext = createContext<{
  workspaces: Workspace[];
  loading: boolean;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  active: Workspace | undefined;
  refresh: () => Promise<void>;
} | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { workspaces, loading, refresh } = useWorkspace();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = workspaces.find((w) => w.id === activeId) || workspaces[0];

  const value = useMemo(
    () => ({
      workspaces,
      loading,
      activeId: active?.id || null,
      setActiveId,
      active,
      refresh,
    }),
    [workspaces, loading, active, refresh],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaceContext must be used within WorkspaceProvider");
  return ctx;
}
`);

write("src/contexts/NotificationContext.tsx", `import React, { createContext, useContext } from "react";
import { useNotifications } from "@/hooks/useNotifications";

const NotificationContext = createContext<ReturnType<typeof useNotifications> | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const value = useNotifications();
  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used within NotificationProvider");
  return ctx;
}
`);

console.log("Part 2 core services/hooks/store done");
