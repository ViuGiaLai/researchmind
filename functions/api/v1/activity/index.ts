import { queryByOwner } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  const url = new URL(context.request.url);
  const workspaceId = url.searchParams.get("workspace_id") || undefined;
  const limit = Number(url.searchParams.get("limit") || 50);

  try {
    let rows = await queryByOwner(context.env, "activity", userId, {
      orderBy: "timestamp",
      limit: Math.min(limit, 200),
    });
    if (workspaceId) {
      rows = rows.filter((r) => r.workspace_id === workspaceId);
    }
    return jsonResponse({
      data: rows.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        detail: a.detail,
        workspaceId: a.workspace_id,
        actorId: a.actor_id,
        actorName: a.actor_name,
        timestamp: a.timestamp || a.created_at,
      })),
      total: rows.length,
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
