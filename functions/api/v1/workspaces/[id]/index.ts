import {
  getDocument,
  queryByOwner,
  recordActivity,
  softDeleteDocument,
  upsertDocument,
} from "../../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../../lib/response";
import { nowIso, readJson, requireUser } from "../../../../lib/http";
export { onRequestOptions } from "../../../../lib/cors";


export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const id = context.params.id;

  try {
    const row = await getDocument(context.env, "workspaces", id);
    if (!row || row.deleted_at) return errorResponse("Workspace not found", 404);
    if (String(row.owner_uid || "") !== userId) {
      const members = await queryByOwner(context.env, "workspace_members", userId, {
        ownerField: "user_id",
        extraFilters: [{ field: "workspace_id", op: "EQUAL", value: id }],
      }).catch(() => []);
      if (!members.length) return errorResponse("Forbidden", 403);
    }
    return jsonResponse({
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
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

export const onRequestPatch = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const id = context.params.id;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  try {
    const row = await getDocument(context.env, "workspaces", id);
    if (!row || row.deleted_at) return errorResponse("Workspace not found", 404);
    if (String(row.owner_uid || "") !== userId) return errorResponse("Forbidden", 403);

    const next = {
      ...row,
      name: body.name !== undefined ? String(body.name) : row.name,
      description: body.description !== undefined ? String(body.description) : row.description,
      sync_state: body.sync_state !== undefined ? body.sync_state : row.sync_state,
      privacy_level: body.privacy_level !== undefined ? body.privacy_level : row.privacy_level,
      paper_count: body.paper_count !== undefined ? Number(body.paper_count) : row.paper_count,
      report_count: body.report_count !== undefined ? Number(body.report_count) : row.report_count,
      storage_bytes: body.storage_bytes !== undefined ? Number(body.storage_bytes) : row.storage_bytes,
      last_backup_at: body.last_backup_at !== undefined ? body.last_backup_at : row.last_backup_at,
      encrypted: body.encrypted !== undefined ? Boolean(body.encrypted) : row.encrypted,
      updated_at: nowIso(),
    };
    await upsertDocument(context.env, "workspaces", id, next);
    await recordActivity(context.env, {
      owner_uid: userId,
      type: "workspace_updated",
      title: "Workspace updated",
      detail: String(next.name),
      workspace_id: id,
      actor_id: userId,
    });
    return jsonResponse(next);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

export const onRequestDelete = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const id = context.params.id;

  try {
    const row = await getDocument(context.env, "workspaces", id);
    if (!row || row.deleted_at) return errorResponse("Workspace not found", 404);
    if (String(row.owner_uid || "") !== userId) return errorResponse("Forbidden", 403);
    await softDeleteDocument(context.env, "workspaces", id, userId);
    return jsonResponse({ success: true });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
