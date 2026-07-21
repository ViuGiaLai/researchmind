/**
 * ResearchMind Cloud Sync Engine
 * Architecture: Offline-first, Incremental, Last-Write-Wins (LWW)
 */
import { db } from "./db";
import { getDeviceFingerprint } from "./device-fingerprint";

const SYNC_API_URL = import.meta.env.VITE_CLOUD_SYNC_URL || "http://localhost:8787/api";

export interface SyncPayload {
  resource: "projects" | "documents" | "annotations" | "notes";
  action: "push" | "pull";
  data: any[];
  deviceId: string;
}

/**
 * Pushes local changes to the Cloudflare Workers API.
 */
export async function pushSync(token: string): Promise<boolean> {
  try {
    // 1. Lấy dữ liệu cần sync từ Dexie (những bản ghi có sync_status = 'pending')
    // Ở bản MVP, ta giả lập kéo toàn bộ projects chưa đồng bộ
    const pendingProjects = await db.projects.filter(p => !p.last_synced_at).toArray();
    // (Tương tự với documents, notes...)

    if (pendingProjects.length === 0) return true;

    const payload = {
      resource: "projects",
      action: "push",
      data: pendingProjects,
      deviceId: getDeviceFingerprint()
    };

    const res = await fetch(`${SYNC_API_URL}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Sync failed");
    
    // 2. Đánh dấu đã sync ở local
    const now = Date.now();
    await db.projects.bulkPut(
      pendingProjects.map(p => ({ ...p, last_synced_at: now }))
    );

    return true;
  } catch (error) {
    console.error("Push Sync Error:", error);
    return false; // Lưu vào Offline Queue để thử lại sau
  }
}

/**
 * Pulls cloud changes from the API and resolves conflicts using LWW.
 */
export async function pullSync(token: string, lastSyncedAt: number): Promise<void> {
  try {
    const res = await fetch(`${SYNC_API_URL}/sync?last_synced_at=${lastSyncedAt}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Pull failed");

    const data = await res.json();
    
    // TODO: Áp dụng dữ liệu mới vào Dexie IndexedDB
    // Conflict Resolution: So sánh updated_at, bản ghi nào mới hơn sẽ ghi đè (Last Write Wins)
    console.log("Pulled data:", data);

  } catch (error) {
    console.error("Pull Sync Error:", error);
  }
}

/**
 * Background Sync Daemon
 * Chạy ngầm mỗi phút hoặc khi có sự kiện mạng (Online/Offline)
 */
export class SyncDaemon {
  private timer: number | null = null;
  private isOnline = navigator.onLine;
  private handleOnline: () => void;
  private handleOffline: () => void;

  constructor(private getToken: () => Promise<string | null>) {
    this.handleOnline = () => {
      this.isOnline = true;
      this.triggerSync();
    };
    this.handleOffline = () => {
      this.isOnline = false;
    };
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
  }

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.triggerSync(), 60000) as unknown as number;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
  }

  async triggerSync() {
    if (!this.isOnline) return;
    
    const token = await this.getToken();
    if (!token) return;

    window.dispatchEvent(new Event("researchmind:sync-start"));

    try {
      // 1. Push changes
      const pushSuccess = await pushSync(token);
      
      // 2. Pull changes if push succeeded (to ensure consistency)
      if (pushSuccess) {
        const lastSynced = localStorage.getItem("rm_last_synced") || "0";
        await pullSync(token, parseInt(lastSynced, 10));
        localStorage.setItem("rm_last_synced", Date.now().toString());
      }
    } finally {
      window.dispatchEvent(new Event("researchmind:sync-end"));
    }
  }
}
