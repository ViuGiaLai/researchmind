import { createClerkClient } from "@clerk/backend";

function log(...args: unknown[]) {
  console.log("[auth]", ...args);
}
function warn(...args: unknown[]) {
  console.warn("[auth]", ...args);
}

export type AuthEnv = {
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  VITE_GATEWAY_SHARED_TOKEN?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_WEB_API_KEY?: string;
};

/**
 * Verify Clerk session JWT. Used by cloud-sync / web Clerk flows.
 */
export async function verifyClerkToken(
  env: AuthEnv,
  request: Request,
): Promise<string | null> {
  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY) return null;
  try {
    const clerk = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
    });

    const requestState = await clerk.authenticateRequest(request);
    if (requestState.isSignedIn) {
      const auth = requestState.toAuth();
      log(`Clerk auth success: userId=${auth.userId}`);
      return auth.userId;
    }

    const status = requestState.status;
    const reason =
      (requestState as { reason?: string; message?: string }).reason ||
      (requestState as { reason?: string; message?: string }).message ||
      "unknown";
    warn(`Clerk auth rejected: status=${status}, reason=${reason}`);
    return null;
  } catch (err) {
    warn(`Clerk auth threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Shared gateway token — desktop/dev fallback (maps to synthetic user).
 */
export function verifySharedToken(env: AuthEnv, token: string): string | null {
  if (!env.VITE_GATEWAY_SHARED_TOKEN) return null;
  if (token === env.VITE_GATEWAY_SHARED_TOKEN) {
    log("Shared token auth success");
    return "__shared__";
  }
  warn("Shared token mismatch");
  return null;
}

/**
 * Verify Firebase ID token (used by Desktop + Web Cloud Platform).
 * Prefer Identity Toolkit lookup when WEB API key is set; otherwise decode
 * JWT claims and check audience/issuer against FIREBASE_PROJECT_ID.
 */
export async function verifyFirebaseToken(
  env: AuthEnv,
  token: string,
): Promise<string | null> {
  const projectId = (env.FIREBASE_PROJECT_ID || "").trim().replace(/^"|"$/g, "");
  if (!projectId || !token) return null;

  const apiKey = (env.FIREBASE_WEB_API_KEY || "").trim();
  if (apiKey) {
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: token }),
        },
      );
      if (!res.ok) {
        warn(`Firebase lookup failed: ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        users?: Array<{ localId?: string }>;
      };
      const uid = data.users?.[0]?.localId;
      if (uid) {
        log(`Firebase auth success: userId=${uid}`);
        return uid;
      }
      return null;
    } catch (err) {
      warn(`Firebase lookup threw: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // Fallback: structural JWT check (signature not verified without certs).
  // Only used when WEB API key is missing — still blocks obviously wrong tokens.
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as {
      sub?: string;
      user_id?: string;
      aud?: string;
      iss?: string;
      exp?: number;
    };
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      warn("Firebase token expired");
      return null;
    }
    if (payload.aud !== projectId) {
      warn(`Firebase aud mismatch: ${payload.aud}`);
      return null;
    }
    const expectedIss = `https://securetoken.google.com/${projectId}`;
    if (payload.iss !== expectedIss) {
      warn(`Firebase iss mismatch: ${payload.iss}`);
      return null;
    }
    const uid = payload.user_id || payload.sub;
    if (uid) {
      warn("Firebase token accepted via claim check only (set FIREBASE_WEB_API_KEY for full verify)");
      return uid;
    }
    return null;
  } catch {
    return null;
  }
}

/** Resolve userId from Bearer token using Clerk → Firebase → shared token. */
export async function resolveUserId(
  env: AuthEnv,
  request: Request,
  bearerToken: string,
): Promise<string | null> {
  if (!bearerToken) return null;

  if (env.CLERK_SECRET_KEY && env.CLERK_PUBLISHABLE_KEY) {
    const clerkUser = await verifyClerkToken(env, request);
    if (clerkUser) return clerkUser;
  }

  const firebaseUser = await verifyFirebaseToken(env, bearerToken);
  if (firebaseUser) return firebaseUser;

  return verifySharedToken(env, bearerToken);
}
