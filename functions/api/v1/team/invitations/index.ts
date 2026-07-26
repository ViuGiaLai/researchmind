import { queryByOwner } from "../../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../../lib/response";
import { requireUser } from "../../../../lib/http";
export { onRequestOptions } from "../../../../lib/cors";

export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    // Fetch all non-accepted, non-revoked invitations
    const allInvites = await queryByOwner(context.env, "workspace_members", userId, {
      orderBy: "created_at",
      limit: 50,
    }).catch(() => []);

    // Filter by active invitation statuses, exclude revoked/cancelled
    const activeStatuses = ["sent", "opened", "expired"];
    const invitations = allInvites.filter(
      (m: any) => activeStatuses.includes(String(m.status || "")) && !m.deleted_at
    );

    const now = new Date().toISOString();
    // Auto-expire invitations past their expiration
    const updated = invitations.map(async (m: any) => {
      const expireAt = m.expire_at || "";
      if (m.status === "sent" && expireAt && expireAt < now) {
        await upsertDocument(context.env, "workspace_members", m.id as string, {
          ...m,
          status: "expired",
          updated_at: now,
        }).catch(() => {});
        return { ...m, status: "expired" };
      }
      return m;
    });

    const resolved = await Promise.all(updated);

    return jsonResponse({
      invitations: resolved.map((m: any) => ({
        id: m.id,
        workspaceId: m.workspace_id || "",
        workspaceName: m.workspace_name || "Unnamed Workspace",
        email: m.identity || m.user_id || "",
        role: m.role || "viewer",
        message: m.message || "",
        status: m.status || "sent",
        inviteToken: m.invite_token || "",
        expireAt: m.expire_at || "",
        acceptedAt: m.accepted_at || "",
        invitedBy: m.invited_by || userId,
        invitedByName: m.invited_by_name || "",
        createdAt: m.created_at || new Date().toISOString(),
      })),
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

// Need upsertDocument for auto-expire
import { upsertDocument } from "../../../../lib/firestore";
