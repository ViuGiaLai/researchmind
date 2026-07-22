/**
 * ResearchMind Local DB — Lightweight IndexedDB wrapper.
 *
 * Provides Dexie-like API (db.projects.filter().toArray(), bulkPut())
 * without requiring the Dexie package. Backed by raw IndexedDB.
 *
 * Schema:
 *   - projects: { id, name, description, status, last_synced_at, ... }
 *   - documents: { id, title, authors, ... }
 *   - annotations: { id, document_id, ... }
 *   - encrypted_notes: { id, encrypted_payload, nonce, ... }
 *   - sync_metadata: { id, device_id, ... }
 */

const DB_NAME = "ResearchMindLocal";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("projects")) {
        const store = db.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("last_synced_at", "last_synced_at", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }

      if (!db.objectStoreNames.contains("documents")) {
        const store = db.createObjectStore("documents", { keyPath: "id" });
        store.createIndex("project_id", "project_id", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      }

      if (!db.objectStoreNames.contains("annotations")) {
        const store = db.createObjectStore("annotations", { keyPath: "id" });
        store.createIndex("document_id", "document_id", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      }

      if (!db.objectStoreNames.contains("encrypted_notes")) {
        const store = db.createObjectStore("encrypted_notes", { keyPath: "id" });
        store.createIndex("user_id", "user_id", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      }

      if (!db.objectStoreNames.contains("sync_metadata")) {
        db.createObjectStore("sync_metadata", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("user_preferences")) {
        db.createObjectStore("user_preferences", { keyPath: "user_id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getStore(db: IDBDatabase, name: string, mode: IDBTransactionMode = "readonly"): IDBObjectStore {
  const tx = db.transaction(name, mode);
  return tx.objectStore(name);
}

// ─── Store proxy with filter() / toArray() / bulkPut() ──────────

class StoreProxy<T extends Record<string, unknown>> {
  constructor(
    private storeName: string,
    keyField: string = "id",
  ) {
    void keyField;
  }

  /** Put (upsert) a single record. */
  async put(item: T): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = getStore(db, this.storeName, "readwrite");
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /** Bulk insert/update records. */
  async bulkPut(items: T[]): Promise<void> {
    if (items.length === 0) return;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = getStore(db, this.storeName, "readwrite");
      let successes = 0;
      let failures = 0;
      let lastError: DOMException | null = null;
      for (const item of items) {
        const req = store.put(item);
        req.onsuccess = () => {
          successes += 1;
          if (successes + failures === items.length) {
            if (failures > 0) reject(lastError || new Error("Bulk put had failures"));
            else resolve();
          }
        };
        req.onerror = () => {
          failures += 1;
          lastError = req.error;
          if (successes + failures === items.length) {
            reject(lastError || new Error("Bulk put had failures"));
          }
        };
      }
    });
  }

  /** Get all records. */
  async toArray(): Promise<T[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = getStore(db, this.storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  /** Filter records by a predicate (client-side). */
  filter(predicate: (item: T) => boolean): { toArray: () => Promise<T[]> } {
    return {
      toArray: async () => {
        const all = await this.toArray();
        return all.filter(predicate);
      },
    };
  }

  /** Get a single record by its key. */
  async get(key: string): Promise<T | undefined> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = getStore(db, this.storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  /** Delete a record by its key. */
  async delete(key: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = getStore(db, this.storeName, "readwrite");
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /** Clear all records. */
  async clear(): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = getStore(db, this.storeName, "readwrite");
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

// ─── Types ─────────────────────────────────────────────────────

export interface DbProject extends Record<string, unknown> {
  id: string;
  name: string;
  description?: string;
  status?: string;
  last_synced_at?: number;
  updated_at?: number;
  created_at?: number;
}

export interface DbDocument extends Record<string, unknown> {
  id: string;
  project_id?: string;
  title: string;
  authors?: string;
  last_synced_at?: number;
  updated_at?: number;
}

export interface DbAnnotation extends Record<string, unknown> {
  id: string;
  document_id: string;
  page_number?: number;
  note_content?: string;
  last_synced_at?: number;
  updated_at?: number;
}

export interface DbEncryptedNote extends Record<string, unknown> {
  id: string;
  user_id: string;
  project_id?: string;
  encrypted_payload: string;
  nonce: string;
  last_synced_at?: number;
  updated_at?: number;
}

// ─── Database instance ─────────────────────────────────────────

export const db = {
  projects: new StoreProxy<DbProject>("projects"),
  documents: new StoreProxy<DbDocument>("documents"),
  annotations: new StoreProxy<DbAnnotation>("annotations"),
  encrypted_notes: new StoreProxy<DbEncryptedNote>("encrypted_notes"),
  sync_metadata: new StoreProxy<{ id: string; [key: string]: unknown }>("sync_metadata"),
  user_preferences: new StoreProxy<{ user_id: string; [key: string]: unknown }>("user_preferences", "user_id"),
};
