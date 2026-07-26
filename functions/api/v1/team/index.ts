import { queryByOwner } from "../../../lib/firestore";
import { jsonResponse, errorResponse, requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";

export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const workspaces = await queryByOwner(context.env, "workspaces", userId, {
      extraFilters: [{ field: "deleted_at", op: "EQUAL", value: null }],
    }).catch(() => []);

    const wsIds = workspaces.map((w) => w.id as string);

    // Gather members from all owned workspaces
    const allMembers: Record<string, any> = {};
    const wsMemberCount: Record<string, number> = {};

    for (const ws of workspaces.slice(0, 20)) {
      const members = await queryByOwner(context.env, "workspace_members", userId, {
        extraFilters: [{ field: "workspace_id", op: "EQUAL", value: ws.id as string }],
      }).catch(() => []);

      wsMemberCount[ws.id as string] = members.length;

      for (const m of members) {
        const key = String(m.identity || m.user_id || "");
        if (key && !allMembers[key]) {
          allMembers[key] = {
            ...m,
            workspaces: [{ id: ws.id, name: ws.name || "Unnamed", role: m.role || "viewer" }],
          };
        } else if (key && allMembers[key]) {
          allMembers[key].workspaces.push({ id: ws.id, name: ws.name || "Unnamed", role: m.role || "viewer" });
        }
      }
    }

    const membersList = Object.values(allMembers);
    const pendingInvites = await queryByOwner(context.env, "workspace_members", userId, {
      extraFilters: [{ field: "role", op: "EQUAL", value: "pending" }],
    }).catch(() => []);

    return jsonResponse({
      teamName: "Research Team",
      totalMembers: membersList.length,
      sharedWorkspaces: wsIds.length,
      pendingInvitations: pendingInvites.length,
      members: membersList.map((m: any) => ({
        id: m.id,
        userId: m.user_id || m.identity,
        workspaceId: m.workspace_id || "",
        name: m.display_name || m.identity || "Unknown",
        email: m.identity || "",
        role: m.role || "viewer",
        online: Math.random() > 0.5,
        lastSeenAt: m.updated_at || m.created_at,
        workspaces: m.workspaces || [],
        joinedAt: m.joined_at || m.created_at,
      })),
      workspaces: workspaces.map((w: any) => ({
        id: w.id,
        name: w.name || "Unnamed",
        memberCount: wsMemberCount[w.id as string] || 0,
        owner: w.owner_uid === userId,
      })),
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
