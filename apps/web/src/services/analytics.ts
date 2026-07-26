import type { AnalyticsSummary } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

export async function getAnalytics(): Promise<AnalyticsSummary> {
  return cloudFetch<AnalyticsSummary>("/analytics");
}
