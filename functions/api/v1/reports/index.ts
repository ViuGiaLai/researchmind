import { nanoid } from "nanoid";
import {
  saveWorkspaceReport,
  createSnapshotReport,
  upsertDocument,
  getDocument,
  recordActivity,
} from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
export { onRequestOptions } from "../../../lib/cors";


export const onRequestPost = async (context: any) => {
  const { request, env, data } = context;

  if (!data.userId) {
    return errorResponse("Unauthorized: Missing or invalid token", 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON payload", 400);
  }

  const rawWs = body.workspace_id || body.metadata?.workspace_id || `ws_${nanoid(8)}`;
  const isSnapshot = body.is_snapshot || body.snapshot || false;

  let id = body.id;
  if (!id) {
    if (isSnapshot) {
      id = `rpt_${nanoid(16)}`;
    } else {
      const cleanWs = rawWs.startsWith("ws_") ? rawWs : `ws_${rawWs.replace(/[^\w-]/g, "")}`;
      id = cleanWs;
    }
  }

  const reportData = {
    ...body,
    id,
    schema_version: 1,
    report_version: 1,
    owner_uid: data.userId,
    visibility: body.visibility || body.metadata?.visibility || "public",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    deleted_by: null,
  };

  try {
    if (id.startsWith("ws_")) {
      await saveWorkspaceReport(env, id, reportData);
      try {
        const existing = await getDocument(env, "workspaces", id);
        await upsertDocument(env, "workspaces", id, {
          id,
          name: existing?.name || body.title || body.metadata?.title || id,
          description: existing?.description || "",
          owner_uid: data.userId,
          sync_state: "Synced",
          paper_count: existing?.paper_count || body.paper_count || 0,
          report_count: 1,
          member_count: existing?.member_count || 1,
          created_at: existing?.created_at || reportData.created_at,
          updated_at: reportData.updated_at,
          deleted_at: null,
        });
      } catch {
        /* non-blocking */
      }
      await recordActivity(env, {
        owner_uid: data.userId,
        type: "report_published",
        title: "Live report published",
        detail: String(body.title || id),
        workspace_id: id,
        actor_id: data.userId,
      }).catch(() => undefined);
    } else {
      await createSnapshotReport(env, id, reportData);
      await recordActivity(env, {
        owner_uid: data.userId,
        type: "snapshot_created",
        title: "Snapshot created",
        detail: String(body.title || id),
        workspace_id: String(body.workspace_id || ""),
        actor_id: data.userId,
      }).catch(() => undefined);
    }
    return jsonResponse({ id, ...reportData }, 201);
  } catch (err: any) {
    return errorResponse(`Failed to create report: ${err.message}`, 500);
  }
};
