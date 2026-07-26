import { API_PATHS, APP_CONFIG } from "@researchmind/config";
import type {
  ActivityItem,
  AnalyticsSummary,
  ApiKey,
  BackupRecord,
  Device,
  NotificationItem,
  Report,
  Snapshot,
  User,
  UserSettings,
  Workspace,
} from "@researchmind/types";

export type AuthTokenProvider = () => string | null | Promise<string | null>;

export interface CloudApiClientOptions {
  /** FastAPI backend base, e.g. http://localhost:8000/api */
  backendBaseUrl?: string;
  /** Pages Functions report API base */
  cloudBaseUrl?: string;
  getToken?: AuthTokenProvider;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`API Error ${status}: ${body}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  getToken?: AuthTokenProvider,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const token = getToken ? await getToken() : null;
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createCloudApiClient(options: CloudApiClientOptions = {}) {
  const backend =
    options.backendBaseUrl?.replace(/\/$/, "") || `${APP_CONFIG.cloudUrl}/api`;
  const cloud =
    options.cloudBaseUrl?.replace(/\/$/, "") ||
    `${APP_CONFIG.cloudUrl}/api/${APP_CONFIG.apiVersion}`;
  const fetchImpl = options.fetchImpl || fetch;
  const getToken = options.getToken;

  const backendReq = <T>(path: string, init: RequestInit = {}) =>
    requestJson<T>(backend, path, init, getToken, fetchImpl);
  const cloudReq = <T>(path: string, init: RequestInit = {}) =>
    requestJson<T>(cloud, path, init, getToken, fetchImpl);

  return {
    me: () => backendReq<{ user: User }>("/auth/me"),
    listWorkspaces: () =>
      backendReq<{ workspaces: Workspace[] }>(API_PATHS.workspaces),
    listWorkspaceMembers: (id: string) =>
      backendReq<{ members: unknown[] }>(`${API_PATHS.workspaces}/${id}/members`),
    listDevices: () => backendReq<{ devices: Device[] }>("/sync/devices"),
    listActivity: () =>
      backendReq<{ activities: ActivityItem[]; total: number }>(API_PATHS.activity),
    listBackups: () => backendReq<{ backups: BackupRecord[] }>(API_PATHS.backups),
    createBackup: () =>
      backendReq<{ name: string; size: number }>(API_PATHS.backups, { method: "POST" }),
    restoreBackup: (name: string) =>
      backendReq(`${API_PATHS.backups}/${encodeURIComponent(name)}/restore`, {
        method: "POST",
      }),
    licenseStatus: () => backendReq("/license/status"),
    getSettings: () => backendReq<UserSettings>(API_PATHS.settings),
    getAnalytics: () => backendReq<AnalyticsSummary>(API_PATHS.analytics),

    listMyReports: () => cloudReq<Report[] | { data: Report[] }>("/reports/me"),
    getReport: (id: string) => cloudReq<Report>(`${API_PATHS.reports}/${id}`),
    getWorkspaceReport: (workspaceId: string) =>
      cloudReq<Report>(`${API_PATHS.workspaces}/${workspaceId}/report`),
    putWorkspaceReport: (workspaceId: string, data: unknown) =>
      cloudReq<Report>(`${API_PATHS.workspaces}/${workspaceId}/report`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    listSnapshots: () =>
      cloudReq<{ data: Snapshot[]; total: number }>(API_PATHS.snapshots),
    listNotifications: () =>
      cloudReq<{ data: NotificationItem[]; total: number }>(API_PATHS.notifications),
    listApiKeys: () => cloudReq<{ data: ApiKey[]; total: number }>("/api-keys"),
  };
}

export type CloudApiClient = ReturnType<typeof createCloudApiClient>;

export const cloudApi = createCloudApiClient();
