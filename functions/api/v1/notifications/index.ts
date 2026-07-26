import { queryByOwner, upsertDocument } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { nowIso, requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


export const onRequestGet = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;

  try {
    const rows = await queryByOwner(context.env, "notifications", userId, {
      orderBy: "created_at",
      limit: 100,
    });
    return jsonResponse({
      data: rows.map((n) => ({
        id: n.id,
        kind: n.kind || "info",
        title: n.title,
        body: n.body || "",
        read: Boolean(n.read),
        href: n.href,
        createdAt: n.created_at,
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

  try {
    const rows = await queryByOwner(context.env, "notifications", userId, {
      limit: 200,
    });
    const ts = nowIso();
    await Promise.all(
      rows
        .filter((n) => !n.read)
        .map((n) =>
          upsertDocument(context.env, "notifications", String(n.id), {
            ...n,
            read: true,
            updated_at: ts,
          }),
        ),
    );
    return jsonResponse({ ok: true });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
