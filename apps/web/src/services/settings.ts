import type { UserSettings } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

export async function getSettings(): Promise<UserSettings> {
  return cloudFetch<UserSettings>("/settings");
}

export async function updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  return cloudFetch<UserSettings>("/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
