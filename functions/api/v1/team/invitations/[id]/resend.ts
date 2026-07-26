import { getDocument, upsertDocument, recordActivity } from "../../../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../../../lib/response";
import { nowIso, requireUser } from "../../../../../lib/http";
export { onRequestOptions } from "../../../../../lib/cors";

function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const invitationId = context.params.id;

  try {
    const inv = await getDocument(context.env, "workspace_members", invitationId);
    if (!inv) return errorResponse("Invitation not found", 404);
    if (String(inv.status || "") !== "sent" && String(inv.status || "") !== "opened") {
      return errorResponse("Invitation is no longer active", 400);
    }

    const ts = nowIso();
    const newToken = generateInviteToken();
    const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await upsertDocument(context.env, "workspace_members", invitationId, {
      ...inv,
      status: "sent",
      invite_token: newToken,
      expire_at: expireAt,
      updated_at: ts,
      resent_at: ts,
    });
    await recordActivity(context.env, {
      owner_uid: userId,
      type: "invitation_resent",
      title: "Invitation resent",
      detail: `${String(inv.identity || "")}`,
      workspace_id: String(inv.workspace_id || ""),
      actor_id: userId,
    });

    return jsonResponse({ resent: true, id: invitationId });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
