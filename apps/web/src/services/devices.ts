import type { Device } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

type CloudDevice = {
  id: string;
  name: string;
  platform: string;
  os?: string;
  version?: string;
  architecture?: string;
  timezone?: string;
  cpu?: string;
  ram?: string;
  diskRemaining?: string;
  lastSeenAt?: string;
  lastSyncAt?: string;
  lastLoginAt?: string;
  createdAt?: string;
  current?: boolean;
  trusted?: boolean;
  online?: boolean;
  syncStatus?: string;
  syncProgress?: number;
  syncHealthPercent?: number;
  lastErrorAt?: string;
  avgSyncTimeMs?: number;
  storageBytes?: number;
  storageMetadataBytes?: number;
  storageReportsBytes?: number;
  storageBackupsBytes?: number;
  workspaceCount?: number;
  workspaces?: { id: string; name: string; syncStatus?: string }[];
  lastIp?: string;
  pendingSync?: number;
  uploading?: number;
  downloading?: number;
  failedSync?: number;
  lastBackupAt?: string;
  nextBackupAt?: string;
  restorePointCount?: number;
  backupSizeBytes?: number;
  recentActivity?: { type: string; title: string; timestamp: string }[];
};

function mapDevice(row: CloudDevice): Device {
  return {
    id: row.id,
    name: row.name || "Unknown",
    platform: (row.platform as Device["platform"]) || "desktop",
    os: row.os || undefined,
    version: row.version || undefined,
    architecture: row.architecture || undefined,
    timezone: row.timezone || undefined,
    cpu: row.cpu || undefined,
    ram: row.ram || undefined,
    diskRemaining: row.diskRemaining || undefined,
    lastSeenAt: row.lastSeenAt || row.createdAt || new Date().toISOString(),
    lastSyncAt: row.lastSyncAt || undefined,
    lastLoginAt: row.lastLoginAt || undefined,
    createdAt: row.createdAt || new Date().toISOString(),
    current: Boolean(row.current),
    trusted: row.trusted !== false,
    online: row.online !== false,
    syncStatus: (row.syncStatus as Device["syncStatus"]) || "synced",
    syncProgress: row.syncProgress,
    syncHealthPercent: row.syncHealthPercent,
    lastErrorAt: row.lastErrorAt || undefined,
    avgSyncTimeMs: row.avgSyncTimeMs,
    storageBytes: row.storageBytes,
    storageMetadataBytes: row.storageMetadataBytes,
    storageReportsBytes: row.storageReportsBytes,
    storageBackupsBytes: row.storageBackupsBytes,
    workspaceCount: row.workspaceCount ?? 0,
    workspaces: Array.isArray(row.workspaces) ? (row.workspaces as Device["workspaces"]) : undefined,
    lastIp: row.lastIp || undefined,
    pendingSync: row.pendingSync ?? 0,
    uploading: row.uploading ?? 0,
    downloading: row.downloading ?? 0,
    failedSync: row.failedSync ?? 0,
    lastBackupAt: row.lastBackupAt || undefined,
    nextBackupAt: row.nextBackupAt || undefined,
    restorePointCount: row.restorePointCount,
    backupSizeBytes: row.backupSizeBytes,
    recentActivity: Array.isArray(row.recentActivity) ? row.recentActivity : undefined,
  };
}

export async function listDevices(): Promise<{ data: Device[]; total: number }> {
  const res = await cloudFetch<{ data: CloudDevice[]; total: number }>("/devices");
  const data = (res.data || []).map(mapDevice);
  return { data, total: res.total ?? data.length };
}

export async function registerDevice(deviceId: string, name: string, platform?: Device["platform"]) {
  return cloudFetch<{ device_id: string; registered: boolean }>("/devices", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, name, platform: platform || "web" }),
  });
}

export async function revokeDevice(deviceId: string) {
  return cloudFetch(`/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
}

export async function getDevice(deviceId: string): Promise<Device | undefined> {
  try {
    const row = await cloudFetch<CloudDevice>(`/devices/${encodeURIComponent(deviceId)}`);
    return mapDevice(row);
  } catch {
    return undefined;
  }
}

export async function renameDevice(deviceId: string, name: string) {
  return cloudFetch(`/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function forceSync(deviceId: string) {
  return cloudFetch(`/devices/${encodeURIComponent(deviceId)}/sync`, { method: "POST" });
}

export async function createDeviceBackup(deviceId: string) {
  return cloudFetch(`/devices/${encodeURIComponent(deviceId)}/backup`, { method: "POST" });
}

export async function restoreDeviceBackup(deviceId: string) {
  return cloudFetch(`/devices/${encodeURIComponent(deviceId)}/restore`, { method: "POST" });
}

export async function listDeviceActivity(deviceId: string) {
  return cloudFetch<{ data: { type: string; title: string; timestamp: string }[]; total: number }>(
    `/devices/${encodeURIComponent(deviceId)}/activity`,
  );
}
