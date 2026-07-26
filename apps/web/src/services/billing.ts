import type { BillingPlan, PlanTier } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";

type LicenseStatus = {
  plan: string;
  active: boolean;
  source?: string;
  license_id?: string;
  email?: string;
  expires_at?: string | null;
  features?: string[];
  error?: string;
};

type BillingResponse = {
  data: BillingPlan[];
  current: PlanTier;
  status: LicenseStatus;
  entitlements: {
    plan: string;
    active: boolean;
    features: string[];
    limits: Record<string, number>;
    aiCredits?: number;
  };
  invoices: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    periodStart?: string;
    periodEnd?: string;
  }>;
};

/** Public catalog — used when API is down/unauthenticated so Pricing never crashes. */
export const DEFAULT_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    currency: "USD",
    features: ["1 workspace", "5 reports", "Desktop local-first"],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 4,
    currency: "USD",
    highlighted: true,
    features: ["10 workspaces", "100 reports", "Cloud backup", "Devices"],
  },
  {
    id: "lab",
    name: "Lab",
    priceMonthly: 12,
    currency: "USD",
    features: ["Team", "API keys", "Priority support", "Higher limits"],
  },
];

function normalizeBilling(raw: Partial<BillingResponse> | null | undefined): BillingResponse {
  const current = (raw?.current || raw?.status?.plan || "free") as PlanTier;
  return {
    data: Array.isArray(raw?.data) && raw.data.length > 0 ? raw.data : DEFAULT_PLANS,
    current,
    status: raw?.status || {
      plan: current,
      active: true,
      source: "local",
      features: [],
    },
    entitlements: raw?.entitlements || {
      plan: current,
      active: true,
      features: [],
      limits: {},
    },
    invoices: Array.isArray(raw?.invoices) ? raw.invoices : [],
  };
}

export async function listPlans(): Promise<BillingResponse> {
  const res = await cloudFetch<Partial<BillingResponse>>("/billing");
  return normalizeBilling(res);
}

/** Soft-fail variant for public marketing pages (Pricing). */
export async function listPlansOrDefault(): Promise<BillingResponse> {
  try {
    return await listPlans();
  } catch {
    return normalizeBilling(null);
  }
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const res = await listPlans();
  return res.status;
}

export async function getEntitlements() {
  const res = await listPlans();
  return res.entitlements;
}

export async function activateLicense(token: string): Promise<LicenseStatus> {
  return cloudFetch<LicenseStatus>("/billing", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
