import type { MemberRole, PlanTier } from "@researchmind/types";
import { PLAN_LIMITS } from "@researchmind/config";

const roleRank: Record<MemberRole, number> = {
  viewer: 1,
  reviewer: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

export function can(role: MemberRole, min: MemberRole): boolean {
  return roleRank[role] >= roleRank[min];
}

export function planLimit(plan: PlanTier, key: keyof (typeof PLAN_LIMITS)["free"]) {
  return PLAN_LIMITS[plan][key];
}
