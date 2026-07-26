import { getDocument, queryByOwner, upsertDocument, processEventSideEffects } from "../../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../../lib/response";
import { nowIso, readJson, requireUser } from "../../../../lib/http";
export { onRequestOptions } from "../../../../lib/cors";

export const onRequestPatch = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const memberId = context.params.id;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  const newRole = String(body.role || "").trim();
  if (!["admin", "editor", "commenter", "viewer", "owner"].includes(newRole)) {
    return errorResponse("invalid role", 400);
  }

  try {
    const member = await getDocument(context.env, "workspace_members", memberId);
    if (!member) return errorResponse("Member not found", 404);

    const ws = await getDocument(context.env, "workspaces", String(member.workspace_id || ""));
    if (!ws || ws.deleted_at) return errorResponse("Workspace not found", 404);
    if (String(ws.owner_uid || "") !== userId) return errorResponse("Forbidden", 403);

    const ts = nowIso();
    await upsertDocument(context.env, "workspace_members", memberId, {
      ...member,
      role: newRole,
      updated_at: ts,
    });
    await processEventSideEffects(context.env, {
      event_type: "team.permission_changed",
      actor_id: userId,
      owner_uid: userId,
      title: "Permission updated",
      detail: `${String(member.identity || "")} → ${newRole}`,
      workspace_id: String(member.workspace_id || ""),
      payload: { member_id: memberId, old_role: String(member.role || ""), new_role: newRole },
    });

    return jsonResponse({ id: memberId, role: newRole, updated_at: ts });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

export const onRequestDelete = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const memberId = context.params.id;

  try {
    const body = await readJson(context.request).catch(() => ({}));
    const keepComments = body?.keepComments !== false;
    const transferOwnership = body?.transferOwnership === true;
    const newOwnerId = String(body?.newOwnerId || "").trim();
    const removeFromWorkspace = String(body?.workspaceId || "").trim();

    const member = await getDocument(context.env, "workspace_members", memberId);
    if (!member) return errorResponse("Member not found", 404);

    const workspaceId = removeFromWorkspace || String(member.workspace_id || "");
    const ws = await getDocument(context.env, "workspaces", workspaceId);
    if (!ws || ws.deleted_at) return errorResponse("Workspace not found", 404);
    if (String(ws.owner_uid || "") !== userId && member.role !== "owner") {
      return errorResponse("Forbidden", 403);
    }

    const ts = nowIso();

    // Handle ownership transfer if the member being removed is the owner
    if (member.role === "owner" || transferOwnership) {
      if (newOwnerId) {
        await upsertDocument(context.env, "workspaces", workspaceId, {
          ...ws,
          owner_uid: newOwnerId,
          updated_at: ts,
        });
      }
    }

    // Soft-delete member
    await upsertDocument(context.env, "workspace_members", memberId, {
      ...member,
      status: "revoked",
      deleted_at: ts,
      deleted_by: userId,
      keep_comments: keepComments,
    });

    // Decrement member count
    await upsertDocument(context.env, "workspaces", workspaceId, {
      ...ws,
      member_count: Math.max(0, Number(ws.member_count || 1) - 1),
      updated_at: ts,
    });

    const activityDetail = transferOwnership && newOwnerId
      ? `${String(member.identity || member.id)} removed, ownership transferred to ${newOwnerId}`
      : `${String(member.identity || member.id)} removed from ${workspaceId}`;
    await processEventSideEffects(context.env, {
      event_type: "team.member_left",
      actor_id: userId,
      owner_uid: userId,
      title: "Member removed",
      detail: activityDetail,
      workspace_id: workspaceId,
      payload: { member_id: memberId, transfer_ownership: transferOwnership },
    });

    return jsonResponse({ deleted: true, id: memberId, ownershipTransferred: transferOwnership && !!newOwnerId });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
