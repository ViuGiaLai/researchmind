import { getDocument, queryByOwner, upsertDocument, processEventSideEffects } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { newId, nowIso, readJson, requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";

function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  const workspaceId = String(body.workspaceId || "").trim();
  const identity = String(body.email || "").trim().toLowerCase();
  const role = String(body.role || "viewer").trim();
  const message = String(body.message || "").trim();

  if (!workspaceId) return errorResponse("workspaceId is required", 400);
  if (!identity) return errorResponse("email is required", 400);
  if (!["admin", "editor", "commenter", "viewer", "owner"].includes(role)) {
    return errorResponse("invalid role", 400);
  }

  try {
    const ws = await getDocument(context.env, "workspaces", workspaceId);
    if (!ws || ws.deleted_at) return errorResponse("Workspace not found", 404);
    if (String(ws.owner_uid || "") !== userId) return errorResponse("Forbidden", 403);

    // Check if already a member
    const existing = await queryByOwner(context.env, "workspace_members", userId, {
      extraFilters: [
        { field: "workspace_id", op: "EQUAL", value: workspaceId },
        { field: "identity", op: "EQUAL", value: identity },
      ],
    }).catch(() => []);
    if (existing.length > 0) return errorResponse("Already invited or a member", 409);

    const id = newId("mem");
    const ts = nowIso();
    const inviteToken = generateInviteToken();
    const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const sourceIp = context.request.headers.get("cf-connecting-ip") || context.request.headers.get("x-forwarded-for") || "";

    const doc = {
      id,
      workspace_id: workspaceId,
      user_id: identity,
      identity,
      display_name: identity,
      role,
      message,
      status: "sent",
      invite_token: inviteToken,
      expire_at: expireAt,
      source_ip: sourceIp,
      owner_uid: userId,
      invited_by: userId,
      joined_at: ts,
      created_at: ts,
    };
    await upsertDocument(context.env, "workspace_members", id, doc);
    await upsertDocument(context.env, "workspaces", workspaceId, {
      ...ws,
      member_count: Number(ws.member_count || 1) + 1,
      updated_at: ts,
    });
    await processEventSideEffects(context.env, {
      event_type: "team.member_invited",
      actor_id: userId,
      owner_uid: userId,
      title: "Member invited",
      detail: `${identity} as ${role}`,
      workspace_id: workspaceId,
      payload: { email: identity, role },
    });

    return jsonResponse(doc, 201);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
