import type { Snapshot, SnapshotTag } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

type CloudSnapshot = {
  id: string;
  reportId: string;
  workspaceId: string;
  workspaceName?: string;
  title: string;
  version: number;
  snapshotType: string;
  tag?: string;
  creator: string;
  device?: string;
  hash?: string;
  url: string;
  note?: string;
  summary?: string;
  changes?: string[];
  createdAt: string;
};

function mapSnapshot(row: CloudSnapshot): Snapshot {
  return {
    id: row.id,
    reportId: row.reportId,
    workspaceId: row.workspaceId || "",
    workspaceName: row.workspaceName || undefined,
    title: row.title || "Untitled",
    version: row.version || 1,
    snapshotType: (row.snapshotType === "manual" ? "manual" : "auto") as Snapshot["snapshotType"],
    tag: (["draft", "milestone", "published", "archived"].includes(row.tag || "") ? row.tag : undefined) as SnapshotTag | undefined,
    creator: row.creator || "unknown",
    device: row.device || undefined,
    hash: row.hash || undefined,
    url: row.url || "",
    note: row.note || undefined,
    summary: row.summary || undefined,
    changes: Array.isArray(row.changes) ? row.changes : undefined,
    createdAt: row.createdAt || new Date().toISOString(),
  };
}

export async function listSnapshots(): Promise<{ data: Snapshot[]; total: number }> {
  const res = await cloudFetch<{ data: CloudSnapshot[]; total: number }>("/snapshots");
  const data = (res.data || []).map(mapSnapshot);
  return { data, total: res.total ?? data.length };
}
