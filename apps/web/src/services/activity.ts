import type { ActivityItem } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

export async function listActivity(params?: {
  workspaceId?: string;
  limit?: number;
}): Promise<{ data: ActivityItem[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.workspaceId) q.set("workspace_id", params.workspaceId);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  const res = await cloudFetch<{ data: ActivityItem[]; total: number }>(
    `/activity${qs ? `?${qs}` : ""}`,
  );
  return { data: res.data || [], total: res.total ?? res.data?.length ?? 0 };
}
