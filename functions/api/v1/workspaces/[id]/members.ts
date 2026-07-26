import { queryByOwner, recordActivity, upsertDocument, getDocument } from "../../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../../lib/response";
import { newId, nowIso, readJson, requireUser } from "../../../../lib/http";
export { onRequestOptions } from "../../../../lib/cors";


export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const workspaceId = context.params.id;

  try {
    const ws = await getDocument(context.env, "workspaces", workspaceId);
    if (!ws || ws.deleted_at) return errorResponse("Workspace not found", 404);
    if (String(ws.owner_uid || "") !== userId) return errorResponse("Forbidden", 403);

    const members = await queryByOwner(context.env, "workspace_members", userId, {
      ownerField: "owner_uid",
      extraFilters: [{ field: "workspace_id", op: "EQUAL", value: workspaceId }],
    }).catch(async () => {
      // Fallback: list by workspace owner match via get all for owner and filter
      const all = await queryByOwner(context.env, "workspace_members", String(ws.owner_uid), {
        orderBy: "created_at",
      });
      return all.filter((m) => m.workspace_id === workspaceId);
    });

    return jsonResponse({
      members: members.map((m) => ({
        id: m.id,
        identity: m.identity || m.user_id,
        display_name: m.display_name || "",
        role: m.role || "viewer",
        user_id: m.user_id,
        created_at: m.joined_at || m.created_at,
      })),
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const workspaceId = context.params.id;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  const identity = String(body.identity || "").trim().toLowerCase();
  const role = body.role || "viewer";
  if (!identity) return errorResponse("identity is required", 400);
  if (!["owner", "admin", "editor", "reviewer", "viewer"].includes(role)) {
    return errorResponse("invalid role", 400);
  }

  try {
    const ws = await getDocument(context.env, "workspaces", workspaceId);
    if (!ws || ws.deleted_at) return errorResponse("Workspace not found", 404);
    if (String(ws.owner_uid || "") !== userId) return errorResponse("Forbidden", 403);

    const id = newId("mem");
    const ts = nowIso();
    const doc = {
      id,
      workspace_id: workspaceId,
      user_id: identity,
      identity,
      display_name: String(body.display_name || ""),
      role,
      owner_uid: userId,
      joined_at: ts,
      created_at: ts,
    };
    await upsertDocument(context.env, "workspace_members", id, doc);
    await upsertDocument(context.env, "workspaces", workspaceId, {
      ...ws,
      member_count: Number(ws.member_count || 1) + 1,
      updated_at: ts,
    });
    await recordActivity(context.env, {
      owner_uid: userId,
      type: "member_invited",
      title: "Member invited",
      detail: `${identity} as ${role}`,
      workspace_id: workspaceId,
      actor_id: userId,
    });
    return jsonResponse(doc, 201);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
