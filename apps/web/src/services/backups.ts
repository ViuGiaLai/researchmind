import type { BackupRecord } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

export async function listBackups(): Promise<{ data: BackupRecord[]; total: number }> {
  const res = await cloudFetch<{ data: BackupRecord[]; total: number }>("/backups");
  return { data: res.data || [], total: res.total ?? res.data?.length ?? 0 };
}

export async function createBackup(input?: {
  name?: string;
  workspaceId?: string;
  type?: BackupRecord["type"];
  sizeBytes?: number;
}): Promise<BackupRecord> {
  return cloudFetch<BackupRecord>("/backups", {
    method: "POST",
    body: JSON.stringify(input || {}),
  });
}

export async function restoreBackup(backupId: string) {
  return cloudFetch<{ status: string; backup_id: string; message?: string }>(
    `/backups/${encodeURIComponent(backupId)}/restore`,
    { method: "POST" },
  );
}
