import { getDocument, upsertDocument, processEventSideEffects } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { nowIso, readJson, requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


const defaults = {
  theme: "dark",
  locale: "en",
  emailNotifications: true,
  weeklyDigest: false,
  autoBackup: true,
  defaultVisibility: "unlisted",
};

export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  // Try Firestore first; fall back to defaults when offline / no Firebase.
  // This lets the UI work in local dev without Firebase setup.
  try {
    const row = await getDocument(context.env, "user_settings", userId);
    return jsonResponse({ ...defaults, ...(row || {}), id: undefined, owner_uid: undefined });
  } catch {
    // Firestore offline / not configured — return defaults
    console.warn("[settings] Firestore unavailable, returning defaults");
    return jsonResponse({ ...defaults });
  }
};

export const onRequestPut = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  // Optimistic: always return the merged result immediately.
  // Try Firestore in background; fall back to returning merged data locally.
  const merged = { ...defaults, ...body };

  try {
    const existing = (await getDocument(context.env, "user_settings", userId)) || {
      ...defaults,
    };
    const next = {
      ...defaults,
      ...existing,
      ...body,
      owner_uid: userId,
      updated_at: nowIso(),
      created_at: existing.created_at || nowIso(),
    };
    delete (next as any).id;
    await upsertDocument(context.env, "user_settings", userId, next);
    
    // Fire-and-forget event emission
    processEventSideEffects(context.env, {
      event_type: "settings.changed",
      actor_id: userId,
      owner_uid: userId,
      title: "Settings updated",
      detail: "User preferences changed",
      payload: { changed_keys: Object.keys(body) },
    }).catch(() => undefined);
    
    const { owner_uid: _o, created_at: _c, updated_at: _u, deleted_at: _d, ...publicSettings } =
      next as any;
    return jsonResponse(publicSettings);
  } catch {
    // Firestore offline — return merged body as optimistic response
    console.warn("[settings] Firestore unavailable, returning optimistic save");
    return jsonResponse(merged);
  }
};
