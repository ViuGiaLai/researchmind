import type { TeamMember, Workspace } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

type CloudWorkspace = {
  id: string;
  name: string;
  description?: string;
  owner_uid?: string;
  sync_state?: string;
  privacy_level?: string;
  paper_count?: number;
  report_count?: number;
  member_count?: number;
  storage_bytes?: number;
  last_backup_at?: string;
  encrypted?: boolean;
  created_at?: string;
  updated_at?: string;
};

type CloudMember = {
  id: string;
  identity: string;
  display_name?: string;
  role: string;
  user_id?: string;
  created_at?: string;
};

function mapWorkspace(row: CloudWorkspace): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    ownerUid: row.owner_uid || "",
    syncState: (row.sync_state as Workspace["syncState"]) || "Synced",
    privacyLevel: (row.privacy_level as Workspace["privacyLevel"]) || "local_only",
    paperCount: row.paper_count ?? 0,
    reportCount: row.report_count ?? 0,
    memberCount: row.member_count ?? 0,
    storageBytes: row.storage_bytes ?? 0,
    lastBackupAt: row.last_backup_at || undefined,
    encrypted: row.encrypted ?? false,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

export async function listWorkspaces(): Promise<{ data: Workspace[]; total: number }> {
  const res = await cloudFetch<{ data: CloudWorkspace[]; total: number }>("/workspaces");
  const data = (res.data || []).map(mapWorkspace);
  return { data, total: res.total ?? data.length };
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  try {
    const row = await cloudFetch<CloudWorkspace>(`/workspaces/${encodeURIComponent(id)}`);
    return mapWorkspace(row);
  } catch {
    return undefined;
  }
}

export async function createWorkspace(input: {
  name: string;
  description?: string;
}): Promise<Workspace> {
  const row = await cloudFetch<CloudWorkspace>("/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapWorkspace(row);
}

export async function updateWorkspace(
  id: string,
  patch: Partial<{ name: string; description: string; sync_state: string }>,
): Promise<Workspace> {
  const row = await cloudFetch<CloudWorkspace>(`/workspaces/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return mapWorkspace(row);
}

export async function listWorkspaceMembers(workspaceId: string): Promise<TeamMember[]> {
  const res = await cloudFetch<{ members: CloudMember[] }>(
    `/workspaces/${encodeURIComponent(workspaceId)}/members`,
  );
  return (res.members || []).map((m) => ({
    id: m.id,
    userId: m.user_id || m.identity,
    workspaceId,
    name: m.display_name || m.identity,
    email: m.identity,
    role: (m.role as TeamMember["role"]) || "viewer",
    joinedAt: m.created_at || new Date().toISOString(),
  }));
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  identity: string,
  role: TeamMember["role"] = "viewer",
  displayName = "",
) {
  return cloudFetch(`/workspaces/${encodeURIComponent(workspaceId)}/members`, {
    method: "POST",
    body: JSON.stringify({ identity, role, display_name: displayName }),
  });
}
