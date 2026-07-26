import { queryByOwner, processEventSideEffects } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { readJson, requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";

/**
 * POST /api/v1/events
 *
 * Unified endpoint for desktop and third-party services to emit structured events.
 * Automatically records activity + creates notifications + snapshots as side effects.
 *
 * Example body:
 * {
 *   "event_type": "paper.imported",
 *   "workspace_id": "ws_xxx",
 *   "title": "Imported 12 papers",
 *   "detail": "Added to AI Research workspace",
 *   "payload": { "count": 12 }
 * }
 */
export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  const eventType = String(body.event_type || "").trim();
  if (!eventType) return errorResponse("event_type is required", 400);

  // Validate event_type format (must be namespaced: prefix.name)
  if (!eventType.includes(".")) {
    return errorResponse("event_type must be namespaced (e.g. 'paper.imported')", 400);
  }

  try {
    const eventId = await processEventSideEffects(context.env, {
      event_type: eventType,
      actor_id: String(body.actor_id || userId),
      owner_uid: userId,
      title: String(body.title || eventType),
      detail: String(body.detail || ""),
      workspace_id: String(body.workspace_id || ""),
      actor_name: String(body.actor_name || ""),
      payload: body.payload || {},
    });

    return jsonResponse({ id: eventId, event_type: eventType }, 201);
  } catch (err: any) {
    return errorResponse(`Failed to process event: ${err.message}`, 500);
  }
};

/**
 * GET /api/v1/events
 * Query params: workspace_id, limit, event_type, category
 * Returns structured events with eventType and payload fields.
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
