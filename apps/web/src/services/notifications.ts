import type { NotificationItem } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

export async function listNotifications(): Promise<{ data: NotificationItem[]; total: number }> {
  const res = await cloudFetch<{ data: NotificationItem[]; total: number }>("/notifications");
  return { data: res.data || [], total: res.total ?? res.data?.length ?? 0 };
}

export async function markAllRead(): Promise<{ ok: true }> {
  return cloudFetch<{ ok: true }>("/notifications", { method: "POST" });
}
