/**
 * ResearchMind cloud synchronization.
 *
 * Local data remains authoritative while offline. Cloud changes are merged
 * first, then dirty local records are pushed. Every record is acknowledged
 * individually before its local sync marker is advanced.
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

async function pullResource<T extends SyncRecord>(
  token: string,
  config: ResourceConfig<T>,
): Promise<void> {
  const response = await requestJson<CloudList<T>>(token, config.endpoint);
  if (!response || !Array.isArray(response.data)) {
    throw new Error(`Invalid cloud response for ${config.endpoint}`);
  }

  const receivedAt = Date.now();
  const merged: T[] = [];
  for (const remote of response.data) {
    if (!remote || typeof remote.id !== "string" || remote.id.length === 0) {
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
    return true;
  } catch (error) {
    console.error("Cloud push failed", error);
    return false;
  }
}

/**
 * Pulls and applies cloud records using Last-Write-Wins conflict resolution.
 */
export async function pullSync(
  token: string,
  _lastSyncedAt: number,
): Promise<void> {
  for (const resource of resources) {
    await pullResource(token, resource);
  }
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

  private readonly handleOnline = () => {
    this.isOnline = true;
    void this.triggerSync();
  };

  private readonly handleOffline = () => {
    this.isOnline = false;
  };

  constructor(private readonly getToken: () => Promise<string | null>) {}

  private attachListeners(): void {
    if (this.listenersAttached) return;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    this.listenersAttached = true;
  }

  start(): void {
    if (this.timer !== null) return;
    this.attachListeners();
    this.isOnline = navigator.onLine;
    this.timer = window.setInterval(
      () => void this.triggerSync(),
      60_000,
    );
    void this.triggerSync();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.listenersAttached) {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
      this.listenersAttached = false;
    }
  }

  triggerSync(): Promise<void> {
    if (!this.isOnline) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runSync().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runSync(): Promise<void> {
    const token = await this.getToken();
    if (!token) return;

    window.dispatchEvent(new Event("researchmind:sync-start"));
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
      localStorage.setItem("rm_last_synced", Date.now().toString());
    } catch (error) {
      console.error("Cloud synchronization failed", error);
    } finally {
      window.dispatchEvent(new Event("researchmind:sync-end"));
    }
  }
}
