export { onRequestOptions } from "../lib/cors";

/**
 * Serve a static file via the ASSETS binding, handling redirects manually.
 * env.ASSETS.fetch() may return a 301 redirect (e.g. /report.html → /report)
 * which the browser would then follow, changing the URL in the address bar.
 * We fetch with redirect: "manual", follow any redirects internally, and
 * return the final content with status 200 (preserving the original URL).
 */
async function serveAsset(
  origin: string,
  path: string,
  assets: any,
  forceHtml = false,
): Promise<Response> {
  let url = new URL(path, origin);
  for (let i = 0; i < 5; i++) {
    const req = new Request(url.toString(), { redirect: "manual" });
    const res = await assets.fetch(req);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      url = new URL(location, origin);
      continue;
    }
    const headers = new Headers(res.headers);
    if (forceHtml) {
      headers.set("Content-Type", "text/html; charset=utf-8");
    }
    return new Response(res.body, {
      status: 200,
      headers,
    });
  }
  return new Response("Not found", { status: 404 });
}

export const onRequestGet = async (context: any) => {
  const { request, env, params } = context;
  const id = params.id || "";
  const url = new URL(request.url);

  // Proxy static files (e.g. /r/style.css → /style.css)
  // without forcing text/html content-type.
  if (id.includes(".")) {
    return serveAsset(url.origin, "/" + id, env.ASSETS, false);
  }

  // Serve report.html at /r/{id} while preserving the clean URL.
  return serveAsset(url.origin, "/report.html", env.ASSETS, true);
};
