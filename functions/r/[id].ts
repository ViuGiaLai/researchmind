export const onRequestGet = async (context: any) => {
  const { request, env, params } = context;
  const id = params.id || "";

  // If requesting a static file (e.g. style.css or script.js), pass through directly to ASSETS
  if (id.includes(".")) {
    return env.ASSETS.fetch(request);
  }

  const url = new URL(request.url);
  const reportHtmlUrl = new URL("/report.html", url.origin);
  return env.ASSETS.fetch(reportHtmlUrl);
};
