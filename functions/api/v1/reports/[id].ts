import { getReport, updateReport } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";

export const onRequestGet = async (context: any) => {
  const { env, data, params } = context;
  const id = params.id;

  try {
    const report = await getReport(env, id);
    if (!report || report.deleted_at) {
      return errorResponse("Report not found", 404);
    }

    // Check visibility — always fail closed (unknown/unset = private)
    // - public:   anyone can view
    // - unlisted: anyone with the link can view (no auth needed)
    // - private:  only owner can view
    const isPublic = report.visibility === "public" || report.visibility === "unlisted";
    if (!isPublic) {
      if (!data.userId || report.owner_uid !== data.userId) {
        return errorResponse("Forbidden: You do not have access to this report", 403);
      }
    }

    return jsonResponse(report, 200);
  } catch (err: any) {
    return errorResponse(`Failed to fetch report: ${err.message}`, 500);
  }
};

export const onRequestPatch = async (context: any) => {
  const { request, env, data, params } = context;
  const id = params.id;

  if (!data.userId) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const report = await getReport(env, id);
    if (!report || report.deleted_at) {
      return errorResponse("Report not found", 404);
    }

    if (report.owner_uid !== data.userId) {
      return errorResponse("Forbidden: Only owner can update", 403);
    }

    const body = await request.json();
    
    // Prevent updating locked fields
    delete body.owner_uid;
    delete body.schema_version;
    delete body.created_at;
    
    const partialData = {
      ...body,
      updated_at: new Date().toISOString(),
      report_version: (report.report_version || 1) + 1
    };

    await updateReport(env, id, partialData);
    
    // Return updated report state
    return jsonResponse({ ...report, ...partialData }, 200);
  } catch (err: any) {
    return errorResponse(`Failed to update report: ${err.message}`, 500);
  }
};

export const onRequestDelete = async (context: any) => {
  const { env, data, params } = context;
  const id = params.id;

  if (!data.userId) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const report = await getReport(env, id);
    if (!report || report.deleted_at) {
      return errorResponse("Report not found", 404);
    }

    if (report.owner_uid !== data.userId) {
      return errorResponse("Forbidden: Only owner can delete", 403);
    }

    // Soft delete
    const partialData = {
      deleted_at: new Date().toISOString(),
      deleted_by: data.userId
    };

    await updateReport(env, id, partialData);
    return jsonResponse({ success: true, message: "Report deleted" }, 200);
  } catch (err: any) {
    return errorResponse(`Failed to delete report: ${err.message}`, 500);
  }
};
