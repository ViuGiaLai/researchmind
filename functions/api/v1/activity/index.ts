import { queryByOwner } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


/**
 * GET /api/v1/activity
 * Query params: workspace_id, limit, event_type (optional filter), after (cursor timestamp)
 */
export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  const url = new URL(context.request.url);
  const workspaceId = url.searchParams.get("workspace_id") || undefined;
  const limit = Number(url.searchParams.get("limit") || 50);
  const eventTypeFilter = url.searchParams.get("event_type") || undefined;
  const categoryFilter = url.searchParams.get("category") || undefined;

  try {
    let rows = await queryByOwner(context.env, "activity", userId, {
      orderBy: "timestamp",
      limit: Math.min(limit, 200),
    });
    if (workspaceId) {
      rows = rows.filter((r) => String(r.workspace_id || "") === workspaceId);
    }
    if (eventTypeFilter) {
      rows = rows.filter((r) => String(r.event_type || r.type || "") === eventTypeFilter);
    }
    if (categoryFilter) {
      // Category is derived from event_type prefix
      rows = rows.filter((r) => {
        const et = String(r.event_type || r.type || "");
        const prefix = et.split(".")[0];
        return prefix === categoryFilter;
      });
    }
    return jsonResponse({
      data: rows.map((a) => ({
        id: a.id,
        eventType: a.event_type || `cloud.${a.type}`,
        type: a.type || a.event_type,
        title: a.title,
        detail: a.detail || "",
        payload: a.payload || undefined,
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
