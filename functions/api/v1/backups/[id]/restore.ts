import { getDocument, upsertDocument } from "../../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../../lib/response";
import { nowIso, requireUser } from "../../../../lib/http";
export { onRequestOptions } from "../../../../lib/cors";


export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const id = context.params.id;

  try {
    const bak = await getDocument(context.env, "backups", id);
    if (!bak || bak.deleted_at) return errorResponse("Backup not found", 404);
    if (bak.owner_uid !== userId) return errorResponse("Forbidden", 403);

    await upsertDocument(context.env, "backups", id, {
      ...bak,
      status: "restoring",
      updated_at: nowIso(),
    });

    // Mark restore request — Desktop / sync clients poll this flag.
    await upsertDocument(context.env, "restore_requests", `${userId}_latest`, {
      id: `${userId}_latest`,
      owner_uid: userId,
      backup_id: id,
      status: "pending",
      created_at: nowIso(),
    });

    await upsertDocument(context.env, "backups", id, {
      ...bak,
      status: "completed",
      updated_at: nowIso(),
    });

    return jsonResponse({
      status: "queued",
      backup_id: id,
      message: "Restore request recorded for Desktop sync clients",
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
