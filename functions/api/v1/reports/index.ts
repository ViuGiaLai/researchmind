import { nanoid } from "nanoid";
import { saveWorkspaceReport, createSnapshotReport } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";

export const onRequestPost = async (context: any) => {
  const { request, env, data } = context;
  
  if (!data.userId) {
    return errorResponse("Unauthorized: Missing or invalid token", 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
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
    deleted_by: null
  };

  try {
    if (id.startsWith("ws_")) {
      await saveWorkspaceReport(env, id, reportData);
    } else {
      await createSnapshotReport(env, id, reportData);
    }
    return jsonResponse({ id, ...reportData }, 201);
  } catch (err: any) {
    return errorResponse(`Failed to create report: ${err.message}`, 500);
  }
};
