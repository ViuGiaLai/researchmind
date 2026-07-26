import { resolveUserId } from "./lib/auth";
import { corsHeaders } from "./lib/cors";

function log(...args: unknown[]) {
  console.log("[middleware]", ...args);
}
function warn(...args: unknown[]) {
  console.warn("[middleware]", ...args);
}
function error(...args: unknown[]) {
  console.error("[middleware]", ...args);
}

export const onRequest = async (context: any) => {
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
    Object.keys(corsHeaders).forEach((key) => {
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};
