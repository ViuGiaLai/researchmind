import { getDocument, upsertDocument, recordActivity } from "../../../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../../../lib/response";
import { nowIso, requireUser } from "../../../../../lib/http";
export { onRequestOptions } from "../../../../../lib/cors";

export const onRequestDelete = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const invitationId = context.params.id;

  try {
    const inv = await getDocument(context.env, "workspace_members", invitationId);
    if (!inv) return errorResponse("Invitation not found", 404);

    const ts = nowIso();
    await upsertDocument(context.env, "workspace_members", invitationId, {
      ...inv,
      status: "cancelled",
      deleted_at: ts,
      deleted_by: userId,
    });
    await recordActivity(context.env, {
      owner_uid: userId,
      type: "invitation_cancelled",
      title: "Invitation cancelled",
      detail: `${String(inv.identity || "")}`,
      workspace_id: String(inv.workspace_id || ""),
      actor_id: userId,
    });

    return jsonResponse({ cancelled: true, id: invitationId });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
