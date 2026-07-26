import type { Invitation, TeamMember, TeamOverview, TeamActivity } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

type CloudTeamResponse = {
  teamName: string;
  totalMembers: number;
  sharedWorkspaces: number;
  pendingInvitations: number;
  members: CloudMember[];
  workspaces: CloudWorkspacePerm[];
};

type CloudMember = {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
  role: string;
  online: boolean;
  lastSeenAt?: string;
  workspaces?: { id: string; name: string; role: string }[];
  joinedAt: string;
};

type CloudWorkspacePerm = {
  id: string;
  name: string;
  memberCount: number;
  owner: boolean;
};

type CloudInvitation = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: string;
  message?: string;
  status: string;
  inviteToken: string;
  expireAt: string;
  acceptedAt?: string;
  invitedBy: string;
  invitedByName?: string;
  createdAt: string;
};

type CloudActivity = {
  id: string;
  type: string;
  title: string;
  detail: string;
  actorId: string;
  actorName: string;
  workspaceId?: string;
  sourceIp?: string;
  deviceInfo?: string;
  timestamp: string;
};

function mapMember(m: CloudMember, workspaceId: string): TeamMember {
  return {
    id: m.id,
    userId: m.userId,
    workspaceId,
    name: m.name,
    email: m.email,
    role: m.role as TeamMember["role"],
    online: m.online,
    lastSeenAt: m.lastSeenAt,
    workspaces: m.workspaces?.map((w) => ({
      id: w.id,
      name: w.name,
      role: w.role as TeamMember["role"],
    })),
    joinedAt: m.joinedAt,
  };
}

function mapInvitation(inv: CloudInvitation): Invitation {
  return {
    id: inv.id,
    workspaceId: inv.workspaceId,
    workspaceName: inv.workspaceName,
    email: inv.email,
    role: inv.role as Invitation["role"],
    message: inv.message,
    status: inv.status as Invitation["status"],
    inviteToken: inv.inviteToken || "",
    expireAt: inv.expireAt || "",
    acceptedAt: inv.acceptedAt,
    invitedBy: inv.invitedBy,
    invitedByName: inv.invitedByName,
    createdAt: inv.createdAt,
  };
}

function mapActivity(a: CloudActivity): TeamActivity {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    detail: a.detail,
    actorId: a.actorId,
    actorName: a.actorName,
    workspaceId: a.workspaceId,
    sourceIp: a.sourceIp,
    deviceInfo: a.deviceInfo,
    timestamp: a.timestamp,
  };
}

export async function getTeamOverview(): Promise<{
  overview: TeamOverview;
  members: TeamMember[];
  workspaces: CloudWorkspacePerm[];
}> {
  const res = await cloudFetch<CloudTeamResponse>("/team");
  const overview: TeamOverview = {
    teamName: res.teamName || "Research Team",
    totalMembers: res.totalMembers || 0,
    sharedWorkspaces: res.sharedWorkspaces || 0,
    pendingInvitations: res.pendingInvitations || 0,
  };
  const firstWs = res.workspaces?.[0]?.id || "";
  const members = (res.members || []).map((m) => mapMember(m, m.workspaceId || firstWs));
  return { overview, members, workspaces: res.workspaces || [] };
}

export async function inviteMember(
  workspaceId: string,
  email: string,
  role: TeamMember["role"] = "viewer",
  message?: string,
): Promise<void> {
  await cloudFetch("/team/invite", {
    method: "POST",
    body: JSON.stringify({ workspaceId, email, role, message }),
  });
}

export async function updateMemberRole(
  memberId: string,
  role: TeamMember["role"],
): Promise<void> {
  await cloudFetch(`/team/member/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(
  memberId: string,
  options?: { workspaceId?: string; transferOwnership?: boolean; newOwnerId?: string; keepComments?: boolean }
): Promise<void> {
  await cloudFetch(`/team/member/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    body: options ? JSON.stringify(options) : undefined,
  });
}

export async function listInvitations(): Promise<Invitation[]> {
  const res = await cloudFetch<{ invitations: CloudInvitation[] }>("/team/invitations");
  return (res.invitations || []).map(mapInvitation);
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  await cloudFetch(`/team/invitations/${encodeURIComponent(invitationId)}`, {
    method: "DELETE",
  });
}

export async function resendInvitation(invitationId: string): Promise<void> {
  await cloudFetch(`/team/invitations/${encodeURIComponent(invitationId)}/resend`, {
    method: "POST",
  });
}

export async function listTeamActivity(): Promise<TeamActivity[]> {
  const res = await cloudFetch<{ activities: CloudActivity[] }>("/team/activity");
  return (res.activities || []).map(mapActivity);
}
