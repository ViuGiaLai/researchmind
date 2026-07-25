export const onRequestGet = async (context: any) => {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Serve report.html directly for /r/:id clean URLs
  const reportHtmlUrl = new URL("/report.html", url.origin);
  const response = await env.ASSETS.fetch(reportHtmlUrl);
  return response;
};
