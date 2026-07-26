import { queryByOwner, processEventSideEffects, softDeleteDocument, upsertDocument } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { newId, nowIso, readJson, requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const rows = await queryByOwner(context.env, "api_keys", userId, {
      orderBy: "created_at",
    });
    return jsonResponse({
      data: rows.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at || undefined,
        scopes: k.scopes || [],
      })),
      total: rows.length,
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  const name = String(body.name || "").trim();
  if (!name) return errorResponse("name is required", 400);

  const secret = `rm_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const id = newId("key");
  const ts = nowIso();
  const prefix = secret.slice(0, 10);

  try {
    await upsertDocument(context.env, "api_keys", id, {
      id,
      owner_uid: userId,
      name,
      prefix,
      // Store hash-like token marker only — full secret returned once.
      token_fingerprint: secret.slice(-12),
      scopes: Array.isArray(body.scopes) ? body.scopes : ["reports:read"],
      created_at: ts,
      updated_at: ts,
    });
    await processEventSideEffects(context.env, {
      event_type: "api_key.created",
      actor_id: userId,
      owner_uid: userId,
      title: "API key created",
      detail: name,
      payload: { key_id: id, scopes: Array.isArray(body.scopes) ? body.scopes : ["reports:read"] },
    });
    return jsonResponse(
      {
        id,
        name,
        prefix,
        createdAt: ts,
        scopes: Array.isArray(body.scopes) ? body.scopes : ["reports:read"],
        secret,
      },
      201,
    );
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
