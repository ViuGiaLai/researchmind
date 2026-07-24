/**
 * Small IndexedDB wrapper for offline-first cloud-sync data.
 *
 * The connection is shared across operations. Opening a new IDBDatabase for
 * every record leaked handles and added latency during bulk synchronization.
 */

const DB_NAME = "ResearchMindLocal";
const DB_VERSION = 2;

let databasePromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains("projects")) {
        const store = database.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("last_synced_at", "last_synced_at", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }

      if (!database.objectStoreNames.contains("documents")) {
        const store = database.createObjectStore("documents", { keyPath: "id" });
        store.createIndex("project_id", "project_id", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      }

      if (!database.objectStoreNames.contains("annotations")) {
        const store = database.createObjectStore("annotations", { keyPath: "id" });
        store.createIndex("document_id", "document_id", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      }

      if (!database.objectStoreNames.contains("encrypted_notes")) {
        const store = database.createObjectStore("encrypted_notes", { keyPath: "id" });
        store.createIndex("user_id", "user_id", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      }

      if (!database.objectStoreNames.contains("sync_metadata")) {
        database.createObjectStore("sync_metadata", { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains("user_preferences")) {
        database.createObjectStore("user_preferences", { keyPath: "user_id" });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      database.onclose = () => {
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Unable to open the local database"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Local database upgrade is blocked by another window"));
    };
  });

  return databasePromise;
}

class StoreProxy<T extends Record<string, unknown>> {
  constructor(
    private readonly storeName: string,
    keyField: string = "id",
  ) {
    void keyField;
  }

  async put(item: T): Promise<void> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).put(item);
      transaction.oncomplete = () => {
        window.dispatchEvent(new CustomEvent("researchmind:data-mutated", { detail: { store: this.storeName } }));
        resolve();
      };
      transaction.onerror = () =>
        reject(transaction.error ?? new Error(`Failed to update ${this.storeName}`));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error(`Update aborted for ${this.storeName}`));
    });
  }

  async bulkPut(items: T[]): Promise<void> {
    if (items.length === 0) return;
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      for (const item of items) store.put(item);
      transaction.oncomplete = () => {
        window.dispatchEvent(new CustomEvent("researchmind:data-mutated", { detail: { store: this.storeName } }));
        resolve();
      };
      transaction.onerror = () =>
        reject(transaction.error ?? new Error(`Bulk update failed for ${this.storeName}`));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error(`Bulk update aborted for ${this.storeName}`));
    });
  }

  async toArray(): Promise<T[]> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  filter(predicate: (item: T) => boolean): { toArray: () => Promise<T[]> } {
    return {
      toArray: async () => (await this.toArray()).filter(predicate),
    };
  }

  async get(key: string): Promise<T | undefined> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async count(): Promise<number> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: string): Promise<void> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).delete(key);
      transaction.oncomplete = () => {
        // Record pending deletion for cloud sync propagation
        this._recordPendingDeletion(key).catch(() => {});
        window.dispatchEvent(new CustomEvent("researchmind:data-mutated", { detail: { store: this.storeName } }));
        resolve();
      };
      transaction.onerror = () =>
        reject(transaction.error ?? new Error(`Delete failed for ${this.storeName}`));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error(`Delete aborted for ${this.storeName}`));
    });
  }

  /**
   * Records a pending deletion intent in sync_metadata so the sync daemon
   * can propagate it to the cloud via DELETE HTTP on the next cycle.
   */
  private async _recordPendingDeletion(resourceId: string): Promise<void> {
    await db.sync_metadata.put({
      id: `del:${this.storeName}/${resourceId}`,
      store_name: this.storeName,
      resource_id: resourceId,
      pending_delete: true,
      created_at: Date.now(),
    });
  }

  async clear(): Promise<void> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error(`Clear failed for ${this.storeName}`));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error(`Clear aborted for ${this.storeName}`));
    });
  }
}

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

export const db = {
  projects: new StoreProxy<DbProject>("projects"),
  documents: new StoreProxy<DbDocument>("documents"),
  annotations: new StoreProxy<DbAnnotation>("annotations"),
  encrypted_notes: new StoreProxy<DbEncryptedNote>("encrypted_notes"),
  sync_metadata: new StoreProxy<{ id: string; [key: string]: unknown }>(
    "sync_metadata",
  ),
  user_preferences: new StoreProxy<{
    user_id: string;
    [key: string]: unknown;
  }>("user_preferences", "user_id"),
};
