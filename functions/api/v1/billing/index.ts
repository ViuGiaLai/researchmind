import { getDocument, upsertDocument, recordActivity } from "../../../lib/firestore";
import { jsonResponse, errorResponse } from "../../../lib/response";
import { nowIso, readJson, requireUser } from "../../../lib/http";
export { onRequestOptions } from "../../../lib/cors";


const PLAN_LIMITS: Record<
  string,
  { workspaces: number; reports: number; storageMb: number; teamMembers: number }
> = {
  free: { workspaces: 1, reports: 5, storageMb: 50, teamMembers: 1 },
  pro: { workspaces: 10, reports: 100, storageMb: 2048, teamMembers: 5 },
  lab: { workspaces: 50, reports: 1000, storageMb: 20480, teamMembers: 25 },
  enterprise: { workspaces: -1, reports: -1, storageMb: -1, teamMembers: -1 },
};

const CATALOG = [
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
  {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: 0,
    currency: "USD",
    features: ["Custom limits", "SSO", "Dedicated support"],
  },
];

function defaultBillingDoc() {
  return {
    plan: "free",
    active: true,
    ai_credits: 0,
    invoices: [] as unknown[],
    source: "cloud",
    features: [] as string[],
  };
}

/** Firestore rejects reserved document ids like `__shared__` (gateway token user). */
function canLoadUserDoc(userId: string | null | undefined): userId is string {
  return Boolean(userId) && !String(userId).startsWith("__");
}

export const onRequestGet = async (context: any) => {
  // Catalog is public; user billing is optional enrichment when authenticated.
  const rawUserId = context.data?.userId as string | null | undefined;

  try {
    let billing: Record<string, unknown> = defaultBillingDoc();

    if (canLoadUserDoc(rawUserId)) {
      try {
        const doc = await getDocument(context.env, "billing", rawUserId);
        if (doc) billing = doc as Record<string, unknown>;
      } catch {
        // Keep free defaults when Firestore is unavailable for this user.
      }
    } else if (rawUserId === "__shared__") {
      billing = { ...defaultBillingDoc(), source: "shared_token" };
    }

    const plan = String(billing.plan || "free");
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    return jsonResponse({
      data: CATALOG,
      current: plan,
      status: {
        plan,
        active: billing.active !== false,
        source: billing.source || (rawUserId ? "cloud" : "anonymous"),
        license_id: billing.license_id,
        email: billing.email,
        expires_at: billing.expires_at || null,
        features: billing.features || [],
      },
      entitlements: {
        plan,
        active: billing.active !== false,
        features: billing.features || [],
        limits: {
          workspaces: limits.workspaces,
          reports: limits.reports,
          storageMb: limits.storageMb,
          teamMembers: limits.teamMembers,
          workspace_members: limits.teamMembers,
          sync_devices: plan === "free" ? 1 : plan === "pro" ? 5 : 25,
        },
        aiCredits: Number(billing.ai_credits || 0),
      },
      invoices: billing.invoices || [],
      usage: billing.usage || null,
    });
  } catch (err: any) {
    // Still return catalog so public Pricing never hard-fails.
    return jsonResponse({
      data: CATALOG,
      current: "free",
      status: {
        plan: "free",
        active: true,
        source: "fallback",
        expires_at: null,
        features: [],
        error: err?.message,
      },
      entitlements: {
        plan: "free",
        active: true,
        features: [],
        limits: PLAN_LIMITS.free,
        aiCredits: 0,
      },
      invoices: [],
      usage: null,
    });
  }
};

export const onRequestPost = async (context: any) => {
  const userId = requireUser(context);
  if (userId instanceof Response) return userId;
  const body = await readJson(context.request);
  if (body instanceof Response) return body;

  const token = String(body.token || body.license_token || "").trim();
  if (!token) return errorResponse("token is required", 400);

  // License tokens are validated offline on Desktop; Cloud stores activation metadata.
  const plan =
    token.toLowerCase().includes("lab")
      ? "lab"
      : token.toLowerCase().includes("ent")
        ? "enterprise"
        : "pro";

  const ts = nowIso();
  try {
    const next = {
      owner_uid: userId,
      plan,
      active: true,
      source: "license_token",
      license_id: token.slice(0, 24),
      activated_at: ts,
      updated_at: ts,
      created_at: ts,
      ai_credits: plan === "lab" ? 5000 : 1000,
      features: [],
      invoices: [],
    };
    await upsertDocument(context.env, "billing", userId, next);
    const user = (await getDocument(context.env, "users", userId)) || { id: userId };
    await upsertDocument(context.env, "users", userId, {
      ...user,
      id: userId,
      plan,
      updated_at: ts,
    });
    await recordActivity(context.env, {
      owner_uid: userId,
      type: "settings_changed",
      title: "Plan activated",
      detail: `Activated ${plan}`,
      actor_id: userId,
    });
    return jsonResponse({
      plan,
      active: true,
      source: "license_token",
      license_id: next.license_id,
      expires_at: null,
      features: [],
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};
