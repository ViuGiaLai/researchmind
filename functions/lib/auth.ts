import { createClerkClient } from "@clerk/backend";

function log(...args: any[]) { console.log("[auth]", ...args); }
function warn(...args: any[]) { console.warn("[auth]", ...args); }

/**
 * Try Clerk session JWT verification.
 * Returns the userId if valid, or null if verification fails.
 */
export async function verifyClerkToken(env: any, request: Request): Promise<string | null> {
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
    
    // Log why it failed
    const status = requestState.status;
    const reason = (requestState as any).reason || (requestState as any).message || "unknown";
    warn(`Clerk auth rejected: status=${status}, reason=${reason}`);
    return null;
  } catch (err) {
    warn(`Clerk auth threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Fallback: verify using a shared secret token (VITE_GATEWAY_SHARED_TOKEN).
 * This mirrors the approach used by cloud_gateway/main.py.
 * Returns "__shared__" userId if valid, or null if not.
 */
export function verifySharedToken(env: any, token: string): string | null {
  if (!env.VITE_GATEWAY_SHARED_TOKEN) {
    return null;
  }
  if (token === env.VITE_GATEWAY_SHARED_TOKEN) {
    log("Shared token auth success");
    return "__shared__";
  }
  warn("Shared token mismatch");
  return null;
}
