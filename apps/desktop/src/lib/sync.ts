/**
 * ResearchMind cloud synchronization.
 *
 * Local data remains authoritative while offline. Cloud changes are merged
 * first, then dirty local records are pushed. Every record is acknowledged
 * individually before its local sync marker is advanced.
 *
 * Deletions are propagated via pending-deletion markers stored in
 * sync_metadata. Every call to store.delete() automatically records a
 * pending deletion that the sync daemon sends as HTTP DELETE to the cloud.
 * Cloud-deleted records are removed locally on the next incremental pull.
 */
import {
  db,
  type DbAnnotation,
  type DbDocument,
  type DbEncryptedNote,
  type DbProject,
} from "./db";

const SYNC_API_URL =
  import.meta.env.VITE_CLOUD_SYNC_URL || "http://localhost:8787/api";
const REQUEST_TIMEOUT_MS = 15_000;
const PUSH_CONCURRENCY = 4;

type SyncRecord = {
  id: string;
  updated_at?: unknown;
  last_synced_at?: unknown;
  [key: string]: unknown;
};

type SyncStore<T extends SyncRecord> = {
  get(key: string): Promise<T | undefined>;
  put(item: T): Promise<void>;
  bulkPut(items: T[]): Promise<void>;
  toArray(): Promise<T[]>;
  delete(key: string): Promise<void>;
};

interface CloudList<T> {
  data: T[];
}

interface ResourceConfig<T extends SyncRecord> {
  endpoint: string;
  store: SyncStore<T>;
}

const resources: ResourceConfig<SyncRecord>[] = [
  { endpoint: "projects", store: db.projects as SyncStore<SyncRecord> },
  { endpoint: "documents", store: db.documents as SyncStore<SyncRecord> },
  { endpoint: "annotations", store: db.annotations as SyncStore<SyncRecord> },
  {
    endpoint: "notes",
    store: db.encrypted_notes as SyncStore<SyncRecord>,
  },
];

function timestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDirty(record: SyncRecord): boolean {
  const lastSynced = timestamp(record.last_synced_at);
  return lastSynced === 0 || timestamp(record.updated_at) > lastSynced;
}

async function requestJson<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(`${SYNC_API_URL}/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Cloud sync ${path} failed (${response.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function mapConcurrent<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(PUSH_CONCURRENCY, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await worker(item);
      }
    },
  );
  await Promise.all(runners);
}

async function pushResource<T extends SyncRecord>(
  token: string,
  config: ResourceConfig<T>,
): Promise<void> {
  const dirtyRecords = (await config.store.toArray()).filter(isDirty);
  await mapConcurrent(dirtyRecords, async (record) => {
    await requestJson(token, config.endpoint, {
      method: "POST",
      body: JSON.stringify(record),
    });

    // Re-read before acknowledging so an edit made during the request is not
    // accidentally marked as synchronized.
    const current = await config.store.get(record.id);
    if (!current) return;
    if (timestamp(current.updated_at) !== timestamp(record.updated_at)) return;
    await config.store.put({
      ...current,
      last_synced_at: Date.now(),
    });
  });
}

/**
 * Pushes pending-deletion markers to the cloud via HTTP DELETE.
 * Each marker is removed from sync_metadata after successful acknowledgment.
 * Partial failure is safe — failed deletions are retried next cycle.
 */
async function pushDeletions(token: string): Promise<void> {
  const allMetadata = (await db.sync_metadata.toArray()).filter(
    (item) => item.pending_delete === true,
  );
  if (allMetadata.length === 0) return;

  await mapConcurrent(allMetadata, async (meta) => {
    const storeName = meta.store_name as string;
    const resourceId = meta.resource_id as string;
    try {
      await requestJson(token, `${storeName}/${resourceId}`, {
        method: "DELETE",
      });
    } catch (error) {
      // 404 means the record is already gone on the cloud — treat as success.
      if (error instanceof Error && error.message.includes("(404)")) {
        // Remove marker and move on.
      } else {
        console.warn(
          `Cloud deletion of ${storeName}/${resourceId} failed, will retry later:`,
          error,
        );
        return; // keep marker for retry next cycle
      }
    }
    // Remove the pending deletion marker
    await db.sync_metadata.delete(meta.id as string);
  });
}

async function pullResource<T extends SyncRecord>(
  token: string,
  config: ResourceConfig<T>,
  since: number,
): Promise<void> {
  const endpoint =
    since > 0 ? `${config.endpoint}?since=${since}` : config.endpoint;
  const response = await requestJson<CloudList<T>>(token, endpoint);
  if (!response || !Array.isArray(response.data)) {
    throw new Error(`Invalid cloud response for ${config.endpoint}`);
  }

  const receivedAt = Date.now();
  const merged: T[] = [];
  for (const remote of response.data) {
    if (!remote || typeof remote.id !== "string" || remote.id.length === 0) {
      continue;
    }

    // Handle cloud-deleted records: remove locally and clear pending deletion
    if ((remote as unknown as { deleted?: unknown }).deleted) {
      try {
        await config.store.delete(remote.id);
      } catch (e) {
        console.warn(`Failed to delete local record ${remote.id}:`, e);
      }
      // Also remove any pending deletion marker for this record
      try {
        await db.sync_metadata.delete(
          `del:${config.endpoint}/${remote.id}`,
        );
      } catch {
        // ignore if no marker exists
      }
      continue;
    }

    const local = await config.store.get(remote.id);
    const remoteUpdatedAt = timestamp(remote.updated_at);
    const localUpdatedAt = timestamp(local?.updated_at);

    // Preserve an equally-new dirty local edit. Otherwise the newest version
    // wins, with cloud winning only when it is strictly newer.
    if (local && remoteUpdatedAt <= localUpdatedAt && isDirty(local)) continue;
    if (local && remoteUpdatedAt < localUpdatedAt) continue;

    merged.push({
      ...local,
      ...remote,
      updated_at: remoteUpdatedAt || localUpdatedAt || receivedAt,
      last_synced_at: receivedAt,
    });
  }
  await config.store.bulkPut(merged);
}

/**
 * Pushes dirty local records in dependency order. Partial success is safe:
 * acknowledged records stay clean and failed records are retried next time.
 * Also pushes any pending deletions to the cloud.
 */
export async function pushSync(token: string): Promise<boolean> {
  try {
    await pushResource(token, {
      endpoint: "projects",
      store: db.projects as SyncStore<DbProject>,
    });
    await pushResource(token, {
      endpoint: "documents",
      store: db.documents as SyncStore<DbDocument>,
    });
    await pushResource(token, {
      endpoint: "annotations",
      store: db.annotations as SyncStore<DbAnnotation>,
    });
    await pushResource(token, {
      endpoint: "notes",
      store: db.encrypted_notes as SyncStore<DbEncryptedNote>,
    });
    // Propagate local deletions to cloud after records are pushed
    await pushDeletions(token);
    return true;
  } catch (error) {
    console.error("Cloud push failed", error);
    return false;
  }
}

/**
 * Pulls and applies cloud records using Last-Write-Wins conflict resolution.
 * Only fetches records changed since the last sync (incremental).
 * Removes local records that have been deleted on the cloud side.
 */
export async function pullSync(
  token: string,
  lastSyncedAt: number,
): Promise<void> {
  const since = Number.isFinite(lastSyncedAt) ? lastSyncedAt : 0;
  for (const resource of resources) {
    await pullResource(token, resource, since);
  }
}

/**
 * Fetches cloud storage statistics for the current user.
 */
export async function fetchCloudStats(
  token: string,
): Promise<{ projects: number; documents: number; annotations: number; notes: number; last_updated: string | null }> {
  return requestJson(token, "stats");
}

/**
 * Wipes all local IndexedDB stores and performs a full pull from cloud.
 * Used when the user explicitly wants to restore their workspace from cloud.
 */
export async function restoreFromCloud(token: string): Promise<void> {
  // Clear all local data stores
  await db.projects.clear();
  await db.documents.clear();
  await db.annotations.clear();
  await db.encrypted_notes.clear();
  await db.sync_metadata.clear();

  // Full pull (since=0 fetches everything)
  await pullSync(token, 0);

  // Reset sync timestamp so next incremental sync works correctly
  localStorage.setItem("rm_last_synced", Date.now().toString());
}

export type SyncMode = "smart" | "manual" | "local_only";

export function getSyncMode(): SyncMode {
  const mode = localStorage.getItem("rm_sync_mode");
  if (mode === "manual" || mode === "local_only") return mode;
  return "smart";
}

export function setSyncMode(mode: SyncMode): void {
  localStorage.setItem("rm_sync_mode", mode);
  window.dispatchEvent(new CustomEvent("researchmind:sync-mode-changed", { detail: { mode } }));
}

let debounceTimer: number | null = null;

/**
 * Triggers a debounced sync operation (e.g. 3s after user finishes editing).
 */
export function debouncedTriggerSync(delayMs = 3000): void {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    window.dispatchEvent(new CustomEvent("researchmind:trigger-sync", { detail: { isForeground: false } }));
  }, delayMs);
}

/**
 * Runs synchronization immediately, every minute, and when connectivity
 * returns. Concurrent triggers share one in-flight operation.
 */
export class SyncDaemon {
  private timer: number | null = null;
  private isOnline = navigator.onLine;
  private listenersAttached = false;
  private inFlight: Promise<void> | null = null;

  get isSyncing(): boolean {
    return this.inFlight !== null;
  }

  private readonly handleOnline = () => {
    this.isOnline = true;
    if (getSyncMode() === "smart") {
      void this.triggerSync(false);
    }
  };

  private readonly handleOffline = () => {
    this.isOnline = false;
  };

  private readonly handleVisibilityChange = () => {
    if (getSyncMode() === "smart") {
      // Re-evaluate timer interval dynamically when tab visibility changes
      this.clearPeriodicTimer();
      this.startPeriodicTimer();
    }
  };

  private readonly handleModeChanged = (e: Event) => {
    const detail = (e as CustomEvent<{ mode: SyncMode }>).detail;
    if (detail.mode === "smart") {
      this.startPeriodicTimer();
    } else {
      this.clearPeriodicTimer();
    }
  };

  constructor(private readonly getToken: () => Promise<string | null>) {}

  private attachListeners(): void {
    if (this.listenersAttached) return;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("researchmind:sync-mode-changed", this.handleModeChanged);
    this.listenersAttached = true;
  }

  private startPeriodicTimer(): void {
    if (this.timer !== null) return;
    // Adaptive Polling: 10 minutes when minimized/hidden, 3 minutes when active
    const intervalMs = document.hidden ? 600_000 : 180_000;
    
    this.timer = window.setInterval(
      () => {
        if (getSyncMode() === "smart" && !document.hidden) {
          void this.triggerSync(false); // Silent background poll
        }
      },
      intervalMs,
    );
  }

  private clearPeriodicTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  start(): void {
    this.attachListeners();
    this.isOnline = navigator.onLine;
    const mode = getSyncMode();

    if (mode === "local_only" || mode === "manual") {
      this.clearPeriodicTimer();
      return;
    }

    if (mode === "smart") {
      this.startPeriodicTimer();
      void this.triggerSync(false); // Initial background check
    }
  }

  stop(): void {
    this.clearPeriodicTimer();
    if (this.listenersAttached) {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
      window.removeEventListener("researchmind:sync-mode-changed", this.handleModeChanged);
      this.listenersAttached = false;
    }
  }

  triggerSync(isForeground = true): Promise<void> {
    const mode = getSyncMode();
    // Local-only mode: NEVER trigger network requests or cloud calls
    if (mode === "local_only") return Promise.resolve();
    // Manual mode: NEVER background poll; only trigger on explicit user action (isForeground = true)
    if (mode === "manual" && !isForeground) return Promise.resolve();
    if (!this.isOnline || !navigator.onLine) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    
    this.inFlight = this.runSync(isForeground).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runSync(isForeground: boolean): Promise<void> {
    const token = await this.getToken();
    if (!token) return;

    if (isForeground) {
      window.dispatchEvent(new CustomEvent("researchmind:sync-start"));
    }

    try {
      const lastSynced = Number.parseInt(
        localStorage.getItem("rm_last_synced") || "0",
        10,
      );

      // Pull first so an older local snapshot cannot overwrite a newer cloud
      // edit. Dirty local records win only when their timestamp is newer.
      await pullSync(token, Number.isFinite(lastSynced) ? lastSynced : 0);
      if (!(await pushSync(token))) {
        throw new Error("One or more local records could not be synchronized");
      }
      const syncTime = Date.now();
      localStorage.setItem("rm_last_synced", syncTime.toString());
      window.dispatchEvent(new CustomEvent("researchmind:sync-success", { detail: { lastSyncedAt: syncTime, isForeground } }));
    } catch (error) {
      console.error("Cloud synchronization failed", error);
      window.dispatchEvent(new CustomEvent("researchmind:sync-error", { detail: { error: error instanceof Error ? error.message : String(error) } }));
    } finally {
      if (isForeground) {
        window.dispatchEvent(new Event("researchmind:sync-end"));
      }
    }
  }
}
