import { getMyReports } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const reports = await getMyReports(context.env, userId);
    const snapshots = reports.filter((r) => !String(r.id || "").startsWith("ws_"));
    return jsonResponse({
      data: snapshots.map((r, i) => ({
        id: r.id,
        reportId: r.id,
        workspaceId: r.workspace_id || "",
        workspaceName: r.workspace_name || r.metadata?.workspace_name || "",
        title: r.title || r.metadata?.title || r.id,
        version: r.report_version || r.version || (snapshots.length - i),
        snapshotType: (r.snapshot_type || r.type || "auto") as string,
        tag: r.tag || undefined,
        creator: r.creator || r.actor_name || r.owner_uid || userId,
        device: r.device || r.metadata?.device || undefined,
        hash: r.hash || undefined,
        url: `/r/${r.id}`,
        note: r.summary || r.note || "",
        summary: r.summary || "",
        changes: Array.isArray(r.changes) ? r.changes : [],
        createdAt: r.created_at,
      })),
      total: snapshots.length,
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
