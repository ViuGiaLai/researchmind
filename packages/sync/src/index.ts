import type { SyncState } from "@researchmind/types";

export interface SyncPayload {
  workspaceId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
  schemaVersion?: number;
}

export interface SyncRecord {
  id: string;
  updatedAt: string;
  lastSyncedAt?: string;
  deletedAt?: string | null;
}

export function timestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isDirty(record: SyncRecord): boolean {
  const lastSynced = timestamp(record.lastSyncedAt);
  return lastSynced === 0 || timestamp(record.updatedAt) > lastSynced;
}

/** Last-write-wins: returns the newer record. On equal timestamps, prefer cloud. */
export function resolveConflict<T extends SyncRecord>(
  local: T,
  cloud: T,
): { winner: T; source: "local" | "cloud" } {
  const localTs = timestamp(local.updatedAt);
  const cloudTs = timestamp(cloud.updatedAt);
  if (localTs > cloudTs) return { winner: local, source: "local" };
  return { winner: cloud, source: "cloud" };
}

export function computeSyncStatus(
  localTime?: string | null,
  cloudTime?: string | null,
): SyncState {
  if (!cloudTime) return "Local Only";
  if (!localTime) return "Backup Available";
  if (timestamp(localTime) === timestamp(cloudTime)) return "Synced";
  return "Conflict";
}

export function mergeMetadata(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
  prefer: "local" | "cloud" = "local",
): Record<string, unknown> {
  if (prefer === "cloud") return { ...local, ...cloud };
  return { ...cloud, ...local };
}

export function buildSyncPayload(
  workspaceId: string,
  metadata: Record<string, unknown>,
): SyncPayload {
  return {
    workspaceId,
    timestamp: new Date().toISOString(),
    metadata,
    schemaVersion: 1,
  };
}
