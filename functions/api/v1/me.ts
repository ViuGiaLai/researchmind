import { getDocument, upsertDocument } from "../../lib/firestore";
import { jsonResponse, errorResponse } from "../../lib/response";
import { nowIso, readJson, requireUser } from "../../lib/http";
export { onRequestOptions } from "../../lib/cors";


export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const row = await getDocument(context.env, "users", userId);
    if (!row) {
      return jsonResponse({
        id: userId,
        email: "",
        name: "Researcher",
        plan: "free",
        emailVerified: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
    return jsonResponse({
      id: row.id || userId,
      email: row.email || "",
      name: row.name || row.display_name || "Researcher",
      avatarUrl: row.avatar_url || undefined,
      plan: row.plan || "free",
      emailVerified: row.email_verified !== false,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

export const onRequestPut = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  try {
    const existing = (await getDocument(context.env, "users", userId)) || {
      id: userId,
      created_at: nowIso(),
      plan: "free",
    };
    const next = {
      ...existing,
      id: userId,
      email: body.email !== undefined ? body.email : existing.email,
      name: body.name !== undefined ? body.name : existing.name,
      display_name: body.name !== undefined ? body.name : existing.display_name,
      avatar_url: body.avatarUrl !== undefined ? body.avatarUrl : existing.avatar_url,
      plan: existing.plan || "free",
      email_verified: true,
      updated_at: nowIso(),
      created_at: existing.created_at || nowIso(),
    };
    await upsertDocument(context.env, "users", userId, next);
    return jsonResponse({
      id: userId,
      email: next.email || "",
      name: next.name || "Researcher",
      avatarUrl: next.avatar_url || undefined,
      plan: next.plan || "free",
      emailVerified: true,
      createdAt: next.created_at,
      updatedAt: next.updated_at,
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
