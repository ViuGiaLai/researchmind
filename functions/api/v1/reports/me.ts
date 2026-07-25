import { getMyReports } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";

export const onRequestGet = async (context: any) => {
  const { env, data } = context;
  
  if (!data.userId) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const reports = await getMyReports(env, data.userId);
    return jsonResponse(reports, 200);
  } catch (err: any) {
    return errorResponse(`Failed to fetch reports: ${err.message}`, 500);
  }
};
