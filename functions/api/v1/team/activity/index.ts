import { queryByOwner } from "../../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../../lib/response";
import { requireUser } from "../../../../lib/http";
export { onRequestOptions } from "../../../../lib/cors";

export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const activity = await queryByOwner(context.env, "activity", userId, {
      orderBy: "timestamp",
      limit: 50,
    }).catch(() => []);

    return jsonResponse({
      activities: activity.map((a: any) => ({
        id: a.id,
        type: a.type || "unknown",
        title: a.title || "",
        detail: a.detail || "",
        actorId: a.actor_id || "",
        actorName: a.actor_name || a.actor_id || userId,
        workspaceId: a.workspace_id || "",
        sourceIp: a.source_ip || "",
        deviceInfo: a.device_info || "",
        timestamp: a.timestamp || a.created_at || new Date().toISOString(),
      })),
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
