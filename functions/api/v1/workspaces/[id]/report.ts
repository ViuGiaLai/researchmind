import { saveWorkspaceReport, getWorkspaceReport } from "../../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../../lib/response";

/**
 * Handle all methods including OPTIONS preflight at the route level.
 * Cloudflare Pages may return 405 for OPTIONS before middleware runs,
 * so we handle it here directly.
 */
export const onRequest = async (context: any) => {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Language, Accept-Language",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PUT") return onRequestPut(context);
  if (context.request.method === "POST") return onRequestPost(context);

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * GET /api/v1/workspaces/:id/report
 * Fetch the latest live report for a workspace
 */
async function onRequestGet(context: any) {
  const { env, data, params } = context;
  const rawId = params.id;
  const workspaceId = rawId.startsWith("ws_") ? rawId : `ws_${rawId}`;

  try {
    const report = await getWorkspaceReport(env, workspaceId);
    if (!report || report.deleted_at) {
      return errorResponse("Workspace report not found", 404);
    }

    const isPublic = report.visibility === "public" || report.visibility === "unlisted";
    if (!isPublic) {
      if (!data.userId || report.owner_uid !== data.userId) {
        return errorResponse("Forbidden: You do not have access to this report", 403);
      }
    }

    return jsonResponse(report, 200);
  } catch (err: any) {
    return errorResponse(`Failed to fetch workspace report: ${err.message}`, 500);
  }
}

/**
 * PUT /api/v1/workspaces/:id/report
 * Create or Update (UPSERT) the latest live report for a workspace
 */
async function onRequestPut(context: any) {
  const { request, env, data, params } = context;
  const rawId = params.id;
  const workspaceId = rawId.startsWith("ws_") ? rawId : `ws_${rawId}`;

  if (!data.userId) {
    return errorResponse("Unauthorized: Missing or invalid token", 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return errorResponse("Invalid JSON payload", 400);
  }

  const reportData = {
    ...body,
    id: workspaceId,
    workspace_id: workspaceId,
    schema_version: 1,
    report_version: (body.report_version || 1),
    owner_uid: data.userId,
    visibility: body.visibility || body.metadata?.visibility || "public",
    created_at: body.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    deleted_by: null
  };

  try {
    await saveWorkspaceReport(env, workspaceId, reportData);
    return jsonResponse({ id: workspaceId, ...reportData }, 200);
  } catch (err: any) {
    return errorResponse(`Failed to save workspace report: ${err.message}`, 500);
  }
}

/**
 * POST fallback for clients expecting POST
 */
async function onRequestPost(context: any) {
  return onRequestPut(context);
}
