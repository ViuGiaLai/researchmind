import { queryByOwner, processEventSideEffects, upsertDocument } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { newId, nowIso, readJson, requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const rows = await queryByOwner(context.env, "backups", userId, {
      orderBy: "created_at",
    });
    return jsonResponse({
      data: rows.map((b) => ({
        id: b.id,
        workspaceId: b.workspace_id || "",
        type: b.type || "full",
        name: b.name,
        sizeBytes: b.size_bytes || 0,
        createdAt: b.created_at,
        status: b.status || "completed",
        payload_ref: b.payload_ref,
      })),
      total: rows.length,
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  const id = newId("bak");
  const ts = nowIso();
  const doc = {
    id,
    owner_uid: userId,
    workspace_id: body.workspaceId || body.workspace_id || "",
    type: body.type || "full",
    name: body.name || `Backup ${ts.slice(0, 19).replace("T", " ")}`,
    size_bytes: Number(body.sizeBytes || body.size_bytes || 0),
    status: "completed",
    payload_ref: body.payload_ref || null,
    metadata: body.metadata || {},
    created_at: ts,
    updated_at: ts,
  };

  try {
    await upsertDocument(context.env, "backups", id, doc);
    await processEventSideEffects(context.env, {
      event_type: "cloud.backup_created",
      actor_id: userId,
      owner_uid: userId,
      title: "Cloud backup created",
      detail: String(doc.name),
      workspace_id: String(doc.workspace_id || ""),
      payload: {
        type: doc.type,
        size_bytes: doc.size_bytes,
      },
    }).catch(() => undefined);
    return jsonResponse(
      {
        id,
        workspaceId: doc.workspace_id,
        type: doc.type,
        name: doc.name,
        sizeBytes: doc.size_bytes,
        createdAt: ts,
        status: "completed",
      },
      201,
    );
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
