import { nanoid } from "nanoid";
import { createReport } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";

export const onRequestPost = async (context: any) => {
  const { request, env, data } = context;
  
  if (!data.userId) {
    return errorResponse("Unauthorized: Missing or invalid token", 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return errorResponse("Invalid JSON payload", 400);
  }

  const id = `rpt_${nanoid()}`;
  
  const reportData = {
    ...body, // Includes title, summary, etc.
    schema_version: 1,
    report_version: 1,
    owner_uid: data.userId,
    visibility: body.visibility || body.metadata?.visibility || "public",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    deleted_by: null
  };

  try {
    await createReport(env, id, reportData);
    return jsonResponse({ id, ...reportData }, 201);
  } catch (err: any) {
    return errorResponse(`Failed to create report: ${err.message}`, 500);
  }
};
