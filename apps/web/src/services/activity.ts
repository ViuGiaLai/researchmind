import type { ActivityItem, EventType, ActivityCategory } from "@researchmind/types";
import { eventCategory } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

export { eventCategory };

type RawActivityRow = {
  id: string;
  eventType?: string;
  type?: string;
  title: string;
  detail?: string;
  payload?: Record<string, unknown>;
  workspaceId?: string;
  actorId?: string;
  actorName?: string;
  timestamp: string;
};

function mapActivity(row: RawActivityRow): ActivityItem {
  const eventType = (row.eventType || `cloud.${row.type || "unknown"}`) as EventType;
  const category = eventCategory(eventType) as ActivityCategory;
  return {
    id: row.id,
    eventType,
    type: row.type || eventType,
    category,
    title: row.title,
    detail: row.detail || "",
    payload: row.payload || undefined,
    workspaceId: row.workspaceId,
    actorId: row.actorId,
    actorName: row.actorName,
    timestamp: row.timestamp || new Date().toISOString(),
  };
}

export async function listActivity(params?: {
  workspaceId?: string;
  limit?: number;
  eventType?: string;
  category?: string;
}): Promise<{ data: ActivityItem[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.workspaceId) q.set("workspace_id", params.workspaceId);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.eventType) q.set("event_type", params.eventType);
  if (params?.category) q.set("category", params.category);
  const qs = q.toString();
  const res = await cloudFetch<{ data: RawActivityRow[]; total: number }>(
    `/activity${qs ? `?${qs}` : ""}`,
  );
  const data = (res.data || []).map(mapActivity);
  return { data, total: res.total ?? data.length };
}
