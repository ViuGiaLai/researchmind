import { resolveUserId } from "./lib/auth";

function log(...args: unknown[]) {
  console.log("[middleware]", ...args);
}
function warn(...args: unknown[]) {
  console.warn("[middleware]", ...args);
}
function error(...args: unknown[]) {
  console.error("[middleware]", ...args);
}

/**
 * Echo back the exact origin for credentialed CORS requests.
 * Cannot use "*" when the browser includes Authorization header.
 */
function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Language, Accept-Language, ngrok-skip-browser-warning",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export const onRequest = async (context: any) => {
  const corsHeaders = buildCorsHeaders(context.request);

  // Handle OPTIONS preflight — return 204 with CORS headers immediately.
  // This MUST run before auth to allow unauthenticated preflight requests.
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = context.request.headers.get("Authorization") || "";
  const hasAuthHeader = authHeader.startsWith("Bearer ");
  const bearerToken = hasAuthHeader ? authHeader.slice(7).trim() : "";

  log(
    `Request: ${context.request.method} ${new URL(context.request.url).pathname} [hasAuth: ${hasAuthHeader}]`,
  );

  let userId: string | null = null;
  if (bearerToken) {
    userId = await resolveUserId(context.env, context.request, bearerToken);
  }

  if (userId) log(`Authenticated: userId=${userId}`);
  else if (hasAuthHeader) warn("All auth methods failed — unauthenticated");
  else log("No auth token — unauthenticated request");

  context.data = { userId };

  try {
    const response = await context.next();
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};
