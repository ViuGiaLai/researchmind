import { getDocument, processEventSideEffects, softDeleteDocument } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


export const onRequestDelete = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const keyId = context.params.id;

  try {
    const row = await getDocument(context.env, "api_keys", keyId);
    if (!row || row.deleted_at) return errorResponse("API key not found", 404);
    if (row.owner_uid !== userId) return errorResponse("Forbidden", 403);
    
    const keyName = String(row.name || "");
    await softDeleteDocument(context.env, "api_keys", keyId, userId);
    
    await processEventSideEffects(context.env, {
      event_type: "api_key.deleted",
      actor_id: userId,
      owner_uid: userId,
      title: "API key deleted",
      detail: keyName,
      payload: { key_id: keyId },
    });
    
    return jsonResponse({ success: true });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
