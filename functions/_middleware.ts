import { verifyClerkToken, verifySharedToken } from "./lib/auth";

function log(...args: any[]) {
  console.log("[middleware]", ...args);
}

function warn(...args: any[]) {
  console.warn("[middleware]", ...args);
}

function error(...args: any[]) {
  console.error("[middleware]", ...args);
}

export const onRequest = async (context: any) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Language, Accept-Language, ngrok-skip-browser-warning",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const authHeader = context.request.headers.get("Authorization") || "";
  const hasAuthHeader = authHeader.startsWith("Bearer ");
  const bearerToken = hasAuthHeader ? authHeader.slice(7).trim() : "";

  log(`Request: ${context.request.method} ${new URL(context.request.url).pathname} [hasAuth: ${hasAuthHeader}]`);

  // Check Clerk configuration
  if (!context.env.CLERK_SECRET_KEY) {
    warn("CLERK_SECRET_KEY is not set — Clerk auth will be skipped");
  }
  if (!context.env.CLERK_PUBLISHABLE_KEY) {
    warn("CLERK_PUBLISHABLE_KEY is not set — Clerk auth will be skipped");
  }

  // ── Try Clerk auth first ──────────────────────────────────────
  let userId: string | null = null;

  if (bearerToken && context.env.CLERK_SECRET_KEY && context.env.CLERK_PUBLISHABLE_KEY) {
    userId = await verifyClerkToken(context.env, context.request);
  }

  // ── Fallback to shared token (VITE_GATEWAY_SHARED_TOKEN) ──────────
  if (!userId && bearerToken && context.env.VITE_GATEWAY_SHARED_TOKEN) {
    userId = verifySharedToken(context.env, bearerToken);
  }

  if (userId) {
    log(`Authenticated: userId=${userId}`);
  } else if (hasAuthHeader) {
    warn("All auth methods failed for token — request will be unauthenticated");
  } else {
    log("No auth token — unauthenticated request");
  }

  context.data = { userId };

  try {
    const response = await context.next();
    const newHeaders = new Headers(response.headers);
    Object.keys(corsHeaders).forEach(key => {
      newHeaders.set(key, (corsHeaders as any)[key]);
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (err: any) {
    error("Request handler threw:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
