export const onRequestGet = async (context: any) => {
  const { request, env, params } = context;
  const id = params.id || "";
  const url = new URL(request.url);

  // If requesting a static file inside /report/ (e.g. /report/style.css or /report/script.js),
  // rewrite URL to root asset path /style.css or /script.js
  if (id.includes(".")) {
    const assetUrl = new URL("/" + id, url.origin);
    return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  }

  const reportHtmlUrl = new URL("/report.html", url.origin);
  return env.ASSETS.fetch(reportHtmlUrl);
};
