import type { ApiKey } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

export async function listApiKeys(): Promise<{ data: ApiKey[]; total: number }> {
  const res = await cloudFetch<{ data: ApiKey[]; total: number }>("/api-keys");
  return { data: res.data || [], total: res.total ?? res.data?.length ?? 0 };
}

export async function createApiKey(name: string, scopes?: string[]) {
  return cloudFetch<ApiKey & { secret: string }>("/api-keys", {
    method: "POST",
    body: JSON.stringify({ name, scopes }),
  });
}

export async function revokeApiKey(id: string) {
  return cloudFetch(`/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
}
