import { getDocument, softDeleteDocument } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


export const onRequestDelete = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const id = context.params.id;

  try {
    const row = await getDocument(context.env, "api_keys", id);
    if (!row || row.deleted_at) return errorResponse("API key not found", 404);
    if (row.owner_uid !== userId) return errorResponse("Forbidden", 403);
    await softDeleteDocument(context.env, "api_keys", id, userId);
    return jsonResponse({ success: true });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
