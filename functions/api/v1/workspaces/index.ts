import { getDocument, queryByOwner, recordActivity, upsertDocument } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { newId, nowIso, readJson, requireUser } from "../../../lib/http";
import { corsHeaders } from "../../../lib/cors";

export const onRequestOptions = async () =>
  new Response(null, { status: 204, headers: corsHeaders });




function mapWorkspace(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    owner_uid: row.owner_uid,
    sync_state: row.sync_state || "Synced",
    privacy_level: row.privacy_level || "local_only",
    paper_count: row.paper_count || 0,
    report_count: row.report_count || 0,
    member_count: row.member_count || 1,
    storage_bytes: row.storage_bytes || 0,
    last_backup_at: row.last_backup_at || null,
    encrypted: row.encrypted ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const rows = await queryByOwner(context.env, "workspaces", userId, {
      orderBy: "updated_at",
    });
    const data = rows.map(mapWorkspace);
    return jsonResponse({ data, total: data.length });
  } catch (err: any) {
    return errorResponse(`Failed to list workspaces: ${err.message}`, 500);
  }
};

export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  const name = String(body.name || "").trim();
  if (!name) return errorResponse("name is required", 400);

  const id = String(body.id || newId("ws"));
  const ts = nowIso();
  const doc = {
    id,
    name,
    description: String(body.description || ""),
    owner_uid: userId,
    sync_state: body.sync_state || "Synced",
    privacy_level: body.privacy_level || "local_only",
    paper_count: Number(body.paper_count || 0),
    report_count: Number(body.report_count || 0),
    member_count: 1,
    storage_bytes: Number(body.storage_bytes || 0),
    last_backup_at: body.last_backup_at || null,
    encrypted: body.encrypted ?? false,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };

  try {
    await upsertDocument(context.env, "workspaces", id, doc);
    await upsertDocument(context.env, "workspace_members", `${id}_${userId}`, {
      id: `${id}_${userId}`,
      workspace_id: id,
      user_id: userId,
      identity: body.identity || userId,
      display_name: body.display_name || "",
      role: "owner",
      owner_uid: userId,
      joined_at: ts,
      created_at: ts,
    });
    await recordActivity(context.env, {
      owner_uid: userId,
      type: "workspace_updated",
      title: "Workspace created",
      detail: name,
      workspace_id: id,
      actor_id: userId,
    });
    return jsonResponse(mapWorkspace(doc), 201);
  } catch (err: any) {
    return errorResponse(`Failed to create workspace: ${err.message}`, 500);
  }
};
