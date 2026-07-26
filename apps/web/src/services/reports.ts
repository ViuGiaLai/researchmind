import type { Report } from "@researchmind/types";
import { cloudFetch } from "@/lib/http";
import { env } from "@/lib/env";

type CloudReport = Record<string, unknown> & {
  id?: string;
  workspace_id?: string;
  workspace_name?: string;
  title?: string;
  type?: string;
  visibility?: string;
  report_version?: number;
  version?: number;
  summary?: string;
  tags?: string[];
  authors?: string[];
  word_count?: number;
  wordCount?: number;
  citation_count?: number;
  citationCount?: number;
  ai_model?: string;
  aiModel?: string;
  device?: string;
  published_by?: string;
  publishedBy?: string;
  doi?: string;
  content_html?: string;
  contentHtml?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
};

function publicUrl(id: string) {
  return `${env.cloudApiBaseUrl.replace(/\/api\/v1$/, "")}/r/${id}`;
}

function mapReport(raw: CloudReport): Report {
  const id = String(raw.id || "");
  const isLive = id.startsWith("ws_") || raw.type === "Live Report";
  return {
    id,
    workspaceId: String(raw.workspace_id || (id.startsWith("ws_") ? id : "")),
    workspaceName: raw.workspace_name ? String(raw.workspace_name) : raw.metadata?.workspace_name ? String(raw.metadata.workspace_name) : undefined,
    title: String(raw.title || raw.metadata?.title || id || "Untitled report"),
    type: isLive ? "Live Report" : "Snapshot",
    url: publicUrl(id),
    visibility: (raw.visibility || raw.metadata?.visibility || "private") as Report["visibility"],
    version: Number(raw.report_version || raw.version || 1),
    summary: raw.summary ? String(raw.summary) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    authors: Array.isArray(raw.authors) ? raw.authors.map(String) : undefined,
    wordCount: raw.word_count ? Number(raw.word_count) : raw.wordCount ? Number(raw.wordCount) : undefined,
    citationCount: raw.citation_count ? Number(raw.citation_count) : raw.citationCount ? Number(raw.citationCount) : undefined,
    aiModel: raw.ai_model ? String(raw.ai_model) : raw.aiModel ? String(raw.aiModel) : undefined,
    device: raw.device ? String(raw.device) : undefined,
    publishedBy: raw.published_by ? String(raw.published_by) : raw.publishedBy ? String(raw.publishedBy) : undefined,
    doi: raw.doi ? String(raw.doi) : undefined,
    contentHtml: raw.content_html ? String(raw.content_html) : raw.contentHtml ? String(raw.contentHtml) : undefined,
    createdAt: String(raw.created_at || new Date().toISOString()),
    updatedAt: String(raw.updated_at || raw.created_at || new Date().toISOString()),
  };
}

/** List reports owned by the authenticated cloud user. */
export async function listReports(): Promise<{ data: Report[]; total: number }> {
  try {
    const res = await cloudFetch<CloudReport[] | { data?: CloudReport[]; reports?: CloudReport[] }>(
      "/reports/me",
    );
    const list = Array.isArray(res)
      ? res
      : res.data || res.reports || [];
    const data = list.map(mapReport);
    return { data, total: data.length };
  } catch (err) {
    // 401 = not logged in → gracefully return empty, don't flood console
    if (err && typeof err === "object" && "status" in err && (err as any).status === 401) {
      return { data: [], total: 0 };
    }
    throw err;
  }
}

export async function getReport(id: string): Promise<Report | undefined> {
  try {
    const raw = await cloudFetch<CloudReport>(`/reports/${encodeURIComponent(id)}`);
    return mapReport({ ...raw, id: raw.id || id });
  } catch (err) {
    // Fallback: workspace live report route
    try {
      const raw = await cloudFetch<CloudReport>(
        `/workspaces/${encodeURIComponent(id)}/report`,
      );
      return mapReport({ ...raw, id: raw.id || id, type: "Live Report" });
    } catch {
      throw err;
    }
  }
}

export async function getWorkspaceReport(workspaceId: string): Promise<Report | undefined> {
  const raw = await cloudFetch<CloudReport>(
    `/workspaces/${encodeURIComponent(workspaceId)}/report`,
  );
  return mapReport({ ...raw, id: raw.id || workspaceId, workspace_id: workspaceId });
}
