/**
 * ResearchMind VN — FastAPI HTTP client.
 *
 * All API calls to the Python backend go through this module.
 * Backend runs at http://127.0.0.1:8765 by default.
 */

import i18n from "../i18n";
import { getFirebaseIdToken } from "./firebase";

export const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8765";

/** URL for iframe downloads. Firebase tokens are short-lived and only used
 * where browsers cannot attach the Authorization header themselves. */
export function getAuthenticatedApiUrl(path: string): string {
  const token = getFirebaseIdToken();
  if (!token) return `${BASE_URL}${path}`;
  const [pathAndQuery, fragment] = path.split("#", 2);
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  return `${BASE_URL}${pathAndQuery}${separator}firebase_token=${encodeURIComponent(token)}${fragment ? `#${fragment}` : ""}`;
}

/** Get the current UI language for API language headers (always normalized to vi/en/ja). */
function getLangHeader(): string {
  const lang = (i18n.language || "vi").split("-")[0];
  if (lang === "vi" || lang === "en" || lang === "ja") return lang;
  return "vi";
}

export function createApiHeaders(
  token: string,
  language: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "X-Language": language,
    "Accept-Language": language,
    "ngrok-skip-browser-warning": "true",
    ...(token ? { Authorization: "Bearer " + token } : {}),
    ...extra,
  };
}

function mergeHeaders(extra?: Record<string, string>): Record<string, string> {
  return createApiHeaders(getFirebaseIdToken(), getLangHeader(), extra);
}

function parseApiError(status: number, text: string): string {
  try {
    const data = JSON.parse(text) as { detail?: unknown; message?: string; error?: string };
    if (data.detail) {
      if (typeof data.detail === "string") return data.detail;
      if (Array.isArray(data.detail)) {
        return data.detail
          .map((d: { msg?: string }) => d.msg || JSON.stringify(d))
          .join("; ");
      }
    }
    if (data.message) return data.message;
    if (data.error) return data.error;
  } catch {
    // not JSON
  }
  if (status === 429) {
    // This is a fallback error string; the UI wraps it in an Error object
    return "Free daily limit exhausted. Try again tomorrow or configure your own API key.";
  }
  return text || `HTTP ${status}`;
}

function isNotFoundError(e: unknown): boolean {
  return e instanceof Error && (e.message.includes("Not Found") || e.message.includes("404"));
}

async function buildDiagnosticsFallback(): Promise<DiagnosticsResponse> {
  const [health, stats, cache, settings] = await Promise.all([
    request<HealthResponse>("GET", "/api/health"),
    request<Stats>("GET", "/api/stats"),
    request<{ llm_cache_count: number; embedding_cache_count: number }>("GET", "/api/settings/cache-stats").catch(
      () => ({ llm_cache_count: 0, embedding_cache_count: 0 }),
    ),
    request<{ setup_completed: boolean }>("GET", "/api/settings").catch(() => ({ setup_completed: true })),
  ]);

  let disk: DiagnosticsResponse["disk"] = { free_gb: null, total_gb: null, warning: false };
  if (stats.data_dir) {
    try {
      const d = await request<{ free_gb: number; total_gb: number; warning: boolean }>(
        "GET",
        `/api/data/disk-space?path=${encodeURIComponent(stats.data_dir)}`,
      );
      disk = { free_gb: d.free_gb, total_gb: d.total_gb, warning: d.warning };
    } catch {
      /* ignore */
    }
  }

  return {
    backend_ready: health.backend_ready ?? health.status === "ok",
    embedder_ready: health.embedder_ready ?? false,
    init_message: health.init_message ?? "",
    version: health.version ?? "0.6.0",
    setup_completed: settings.setup_completed ?? true,
    llm_mode: stats.llm_mode,
    embedding_model: stats.embedding_model,
    local_model: health.local_model ?? "",
    data_dir: stats.data_dir ?? "",
    total_papers: stats.total_papers,
    indexed_papers: stats.indexed_papers,
    total_chunks: stats.total_chunks,
    chroma_chunks: stats.chroma_chunks,
    chunk_sync_ok: stats.total_chunks === stats.chroma_chunks,
    total_size_mb: stats.total_size_mb,
    bm25_ready: true,
    vector_ready: stats.chroma_chunks >= 0,
    disk,
    cache,
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: mergeHeaders({ "Content-Type": "application/json" }),
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(res.status, err));
    }
    if (res.status === 204) {
      return undefined as T;
    }
    const text = await res.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error("Cannot connect to the backend. Make sure FastAPI is running (cd backend && uvicorn main:app --reload --port 8765).");
    }
    throw e;
  }
}

// ─── Types ─────────────────────────────────────────────────────

export interface Paper {
  id: string;
  filename: string;
  title: string;
  authors: string;
  year: number | null;
  doi: string;
  page_count: number | null;
  file_size: number;
  language: string;
  status: string;
  ocr_pages_count?: number;
  ocr_pages_failed?: number;
  is_scanned?: boolean;
  tags: string;
  notes: string;
  auto_summary: string;
  auto_summary_lang?: string;
  read_status: string;
  starred: boolean;
  thumbnail_url?: string;
  layout_stats?: Record<string, { columns: number; multicolumn: boolean }> | null;
  created_at: string | null;
  indexed_at: string | null;
}

export interface SearchResult {
  chunk_id: string;
  paper_id: string;
  paper_title: string;
  content: string;
  page_number: number | null;
  score: number;
  chunk_index?: number;
}

export interface SearchResultCluster {
  paper_id: string;
  paper_title: string;
  chunks: SearchResult[];
}

export interface Citation {
  source: string;
  page: number | null;
  text: string;
  ref_id?: number;
  paper_id?: string;
  paper_title?: string;
  text_snippet?: string;
  verification_status?: "verified" | "partial" | "unverified";
  verification_reason?: string;
  grounding_score?: number;
  page_valid?: boolean;
}

export interface ChatResponse {
  answer: string;
  modified_content?: string;
  citations: Citation[];
  model_used: string;
  papers_used: string[];
  chunks_used: number;
  warning?: string;
}

export interface Stats {
  total_papers: number;
  indexed_papers: number;
  total_chunks: number;
  chroma_chunks: number;
  total_size_mb: number;
  embedding_model: string;
  llm_mode: string;
  data_dir?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  embedding_model: string;
  llm_mode: string;
  local_model: string;
  total_papers: number;
  total_chunks: number;
  embedder_ready?: boolean;
  backend_ready?: boolean;
  init_message?: string;
}

export interface DiagnosticsResponse {
  backend_ready: boolean;
  embedder_ready: boolean;
  init_message: string;
  version: string;
  setup_completed: boolean;
  llm_mode: string;
  embedding_model: string;
  local_model: string;
  data_dir: string;
  total_papers: number;
  indexed_papers: number;
  total_chunks: number;
  chroma_chunks: number;
  chunk_sync_ok: boolean;
  total_size_mb: number;
  bm25_ready: boolean;
  vector_ready: boolean;
  disk: { free_gb: number | null; total_gb: number | null; warning: boolean };
  cache: { llm_cache_count: number; embedding_cache_count: number };
  reliability?: {
    window_days: number;
    score: number;
    status: "healthy" | "attention" | "degraded";
    ingestion: { total: number; ready: number; failed: number; active: number; success_rate: number };
    index: { sqlite_chunks: number; vector_chunks: number; sync_ok: boolean; indexed_without_chunks: number };
    citations: { messages_sampled: number; total: number; mapped: number; verified: number; invalid_pages: number; mapping_rate: number; verification_rate: number };
    ai: { traces: number; success: number; success_rate: number; p50_ms: number; p95_ms: number; jobs_queued: number; jobs_failed: number };
    issues: Array<{ code: string; severity: "warning" | "error"; count: number }>;
  };
}

export interface AiControlMetrics {
  prompt_contract_version: string;
  metrics: Record<string, number>;
  providers: Record<string, { successes: number; failures: number; consecutive_failures: number; circuit_open: boolean; latency_ms: number }>;
  cache: { hits: number; misses: number; hit_rate: number };
  usage: { estimated_tokens_today: number; messages_today: number; daily_token_budget: number };
  jobs: { queued: number; running: number; failed: number; cancelled: number };
  routing: { primary: Record<string, string>; fallback: Record<string, string> };
}

export interface AiEvaluationReport {
  method: string;
  history: {
    answers: number; citation_coverage: number; citation_verification: number;
    citation_mapping: number; hallucination_risk: number; language_consistency: number;
    invalid_pages: number;
    models: Array<{ model: string; answers: number; citation_verification: number; hallucination_risk: number }>;
  };
  rag: { cases: number; recall_at_k: number; mrr: number };
  prompt_regression: { name: string; version: string; passed: boolean; missing_variables: string[] };
}

export interface PdfAnnotation {
  id: string;
  paper_id: string;
  project_id: string | null;
  page_number: number;
  kind: "highlight" | "note" | "quote";
  quote_text: string;
  note: string;
  color: "yellow" | "green" | "blue" | "pink";
  tags: string[];
  position: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface ResearchProject {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  research_question: string;
  status: "active" | "archived";
  paper_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ResearchProjectDetail extends Omit<ResearchProject, "paper_count"> {
  papers: Array<Pick<Paper, "id" | "title" | "year" | "page_count" | "status"> & { authors: string[] }>;
  evidence: PdfAnnotation[];
}

export interface ScreeningDecisionRecord {
  paper_id: string;
  project_id: string | null;
  stage: "title_abstract" | "full_text";
  decision: "include" | "exclude" | "maybe";
  reason: string;
  reviewer: string;
  updated_at: string | null;
}

export interface PrismaCounts {
  identified: number;
  duplicates_removed: number;
  screened: number;
  title_abstract_excluded: number;
  full_text_assessed: number;
  full_text_excluded: number;
  included: number;
  awaiting_screening: number;
}

export interface ReviewAuditEvent {
  id: number;
  paper_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  actor: string;
  created_at: string | null;
}

export interface DataBackup {
  name: string;
  size: number;
  created_at: string;
}

export interface ResearchArtifact {
  id: string;
  project_id: string;
  artifact_type: "note" | "evidence" | "review" | "matrix" | "report";
  title: string;
  source_id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface LivingReviewSubscription {
  id: string;
  project_id: string;
  name: string;
  query: string;
  enabled: boolean;
  last_checked_at: string | null;
  last_seen_paper_at: string | null;
}

export interface WorkspaceMember {
  id: string;
  identity: string;
  display_name: string;
  role: "owner" | "editor" | "reviewer" | "viewer";
  created_at: string | null;
}

export interface LicenseStatus {
  plan: "free" | "trial" | "pro" | "pro_plus" | "lab";
  active: boolean;
  source: "free" | "trial" | "license";
  license_id: string;
  email: string;
  expires_at: string | null;
  features: string[];
  error?: string;
}

export interface Highlight {
  category: string;
  text: string;
  page_hint: number | null;
  importance: string;
  note: string;
}

export interface CitationEntry {
  paper_id: string;
  title: string;
  authors: string[];
  year: number | string;
  doi: string;
  pages: number | null;
  formatted: string;
  style: string;
}

export interface CiteResponse {
  citations: CitationEntry[];
  bibliography: string;
  style: string;
  count: number;
}

export interface RelatedPaper {
  paper_id: string;
  title: string;
  similarity: number;
  snippet: string;
  matching_chunks: number;
}

export interface ChunkMatch {
  chunk_id: string;
  paper_id: string;
  paper_title: string;
  content: string;
  page_number: number | null;
  chunk_index: number | null;
  similarity: number;
}

export interface RelatedPaperMatchesResponse {
  matches: ChunkMatch[];
  paper_id: string;
  other_paper_id: string;
  other_paper_title: string;
  model_info: { name: string; mode: string };
}

export interface ImportJob {
  id: string;
  paper_id: string | null;
  filename: string;
  source_path: string;
  file_path: string;
  status: string;
  stage: string;
  progress: number;
  error: string;
  ocr_pages_count: number;
  ocr_pages_failed: number;
  is_scanned: boolean;
  attempts: number;
  created_at: string | null;
  updated_at: string | null;
  finished_at: string | null;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  paper_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilters;
  created_at: string | null;
  updated_at: string | null;
}

export interface SearchFilters {
  collection_id?: string;
  author?: string;
  year_from?: number | null;
  year_to?: number | null;
  tags?: string[];
  read_status?: string;
  starred?: boolean | null;
  sort_by?: string;
  sort_order?: string;
}

// ─── Deep Research types ───────────────────────────────────────

export interface DecomposeResponse {
  sub_questions: string[];
  brief: string;
}

export interface DeepResearchResponse {
  content: string;
  sub_questions: string[];
  brief: string;
  personas: { name: string; description: string; focus_areas: string[] }[];
  model_used: string;
  finish_reason: string;
}

// ─── Anonymization ──────────────────────────────────────────────

export interface AnonymizationStatus {
  paper_id: string;
  is_active: boolean;
  entities_found: number;
  has_map: boolean;
  stats: Record<string, number>;
}

export interface EntityMapEntry {
  label: string;
  entity_type: string;
  count: number;
}

export interface EntityMapResponse {
  paper_id: string;
  entities: Record<string, EntityMapEntry>;
}

export const anonymization = {
  /** Chạy anonymization cho một paper (hoặc kích hoạt lại nếu đã có map) */
  run: (paperId: string, forceRefresh = false) =>
    request<AnonymizationStatus>("POST", `/api/anonymize/${paperId}`, {
      force_refresh: forceRefresh,
    }),

  /** Lấy trạng thái anonymization hiện tại */
  getStatus: (paperId: string) =>
    request<AnonymizationStatus>("GET", `/api/anonymize/${paperId}`),

  /** Bật/Tắt chế độ ẩn danh */
  toggle: (paperId: string) =>
    request<AnonymizationStatus>("POST", `/api/anonymize/${paperId}/toggle`),

  /** Xóa toàn bộ map (không thể hoàn tác) */
  remove: (paperId: string) =>
    request<{ detail: string }>("DELETE", `/api/anonymize/${paperId}`),

  /** Lấy entity map để hiển thị cho người dùng */
  getMap: (paperId: string) =>
    request<EntityMapResponse>("GET", `/api/anonymize/${paperId}/map`),

  /** Anonymize một đoạn text theo context map của paper */
  anonymizeText: (paperId: string, rawText: string) =>
    request<{ text: string; anonymized: boolean }>(
      "POST",
      `/api/anonymize/${paperId}/anonymize-text`,
      { raw_text: rawText },
    ),
};

// ─── API functions ─────────────────────────────────────────────

export const api = {
  getLicenseStatus: () => request<LicenseStatus>("GET", "/api/license/status"),
  activateLicense: (token: string) =>
    request<LicenseStatus>("POST", "/api/license/activate", { token }),
  deactivateLicense: () => request<LicenseStatus>("DELETE", "/api/license"),

  // Health
  health: () => request<HealthResponse>("GET", "/api/health"),

  ping: () => request<{ status: string; backend_ready?: boolean; init_message?: string }>("GET", "/api/ping"),

  getDiagnostics: async () => {
    const paths = ["/api/system/diagnostics", "/api/settings/diagnostics"];
    for (const path of paths) {
      try {
        return await request<DiagnosticsResponse>("GET", path);
      } catch (e) {
        if (!isNotFoundError(e)) throw e;
      }
    }
    return buildDiagnosticsFallback();
  },

  getAiControlMetrics: () => request<AiControlMetrics>("GET", "/api/ai/metrics"),
  getAiEvaluation: () => request<AiEvaluationReport>("GET", "/api/ai/evaluation"),

  rebuildFts: async () => {
    const paths = ["/api/system/rebuild-fts", "/api/settings/rebuild-fts"];
    let lastError: unknown;
    for (const path of paths) {
      try {
        return await request<{ status: string; message: string }>("POST", path);
      } catch (e) {
        lastError = e;
        if (!isNotFoundError(e)) throw e;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Rebuild FTS not available — restart the backend (uvicorn main:app --reload --port 8765).");
  },

  // Papers
  listPapers: async (page = 1, limit = 20, status?: string, readStatus?: string, starred?: boolean, extra?: {
    collection_id?: string;
    author?: string;
    year_from?: number | null;
    year_to?: number | null;
    tag?: string;
    sort_by?: string;
    order?: string;
    q?: string;
  }) => {
    const backendLimit = 100;
    const buildParams = (requestPage: number, requestLimit: number) => {
      const params = new URLSearchParams({ page: String(requestPage), limit: String(requestLimit) });
      if (status) params.set("status", status);
      if (readStatus) params.set("read_status", readStatus);
      if (starred !== undefined) params.set("starred", String(starred));
      if (extra?.collection_id) params.set("collection_id", extra.collection_id);
      if (extra?.author) params.set("author", extra.author);
      if (extra?.year_from) params.set("year_from", String(extra.year_from));
      if (extra?.year_to) params.set("year_to", String(extra.year_to));
      if (extra?.tag) params.set("tag", extra.tag);
      if (extra?.sort_by) params.set("sort_by", extra.sort_by);
      if (extra?.order) params.set("order", extra.order);
      if (extra?.q) params.set("q", extra.q);
      return params;
    };

    if (limit <= backendLimit) {
      return request<{ total: number; page: number; limit: number; papers: Paper[] }>(
        "GET", `/api/papers?${buildParams(page, limit)}`
      );
    }

    const startIndex = (page - 1) * limit;
    let backendPage = Math.floor(startIndex / backendLimit) + 1;
    let skip = startIndex % backendLimit;
    const papers: Paper[] = [];
    let total = 0;

    while (papers.length < limit) {
      const res = await request<{ total: number; page: number; limit: number; papers: Paper[] }>(
        "GET", `/api/papers?${buildParams(backendPage, backendLimit)}`
      );
      total = res.total;
      const batch = skip > 0 ? res.papers.slice(skip) : res.papers;
      papers.push(...batch);
      if (res.papers.length < backendLimit || startIndex + papers.length >= total) {
        break;
      }
      backendPage += 1;
      skip = 0;
    }

    return { total, page, limit, papers: papers.slice(0, limit) };
  },

  getPaper: (id: string) => request<Paper & { chunk_count: number }>("GET", `/api/papers/${id}`),

  updatePaper: (id: string, update: Partial<Paper>) =>
    request<Paper>("PATCH", `/api/papers/${id}`, update),

  deletePaper: (id: string) => request<{ status: string }>("DELETE", `/api/papers/${id}`),

  retryPaperOcr: (id: string) =>
    request<{ status: string; job_id: string; paper_id: string }>("POST", `/api/papers/${id}/retry-ocr`),

  regenerateSummary: (paperId: string) =>
    request<{ status: string; auto_summary: string; auto_summary_lang: string }>("POST", `/api/papers/${paperId}/regenerate-summary`),

  importPaper: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/api/papers/import`, { method: "POST", headers: mergeHeaders(), body: formData });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(res.status, err));
    }
    return res.json();
  },

  importFolder: (folderPath: string) =>
    request<{ total: number; results: unknown[] }>("POST", "/api/papers/import/folder", {
      folder_path: folderPath,
    }),

  listImportJobs: (limit = 50) =>
    request<{ jobs: ImportJob[] }>("GET", `/api/jobs?limit=${limit}`),

  streamImportJobs: (
    jobIds: string[],
    handlers: {
      onJobs?: (jobs: ImportJob[]) => void;
      onDone?: (jobs: ImportJob[]) => void;
      onError?: (error: string) => void;
    },
  ) => {
    const controller = new AbortController();
    (async () => {
      try {
        const ids = jobIds.map(encodeURIComponent).join(",");
        const res = await fetch(`${BASE_URL}/api/jobs/stream?ids=${ids}`, { headers: mergeHeaders(), signal: controller.signal });
        if (!res.ok) {
          handlers.onError?.(await res.text());
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          handlers.onError?.("No response body");
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6).trim());
              if (data.type === "jobs") handlers.onJobs?.(data.jobs || []);
              else if (data.type === "done") {
                handlers.onDone?.(data.jobs || []);
                return;
              } else if (data.type === "timeout") {
                handlers.onError?.("Import status stream timed out");
                return;
              }
            } catch {
              // Ignore malformed SSE frames.
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") handlers.onError?.(err instanceof Error ? err.message : String(err));
      }
    })();
    return { abort: () => controller.abort() };
  },

  retryImportJob: (jobId: string) =>
    request<{ status: string; job_id: string }>("POST", `/api/jobs/${jobId}/retry`),

  importBibtex: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/api/papers/import/bibtex`, { method: "POST", headers: mergeHeaders(), body: formData });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ total: number; imported: number; errors: number; results: { filename: string; status: string; paper_id?: string; title?: string; error?: string }[] }>;
  },

  importZoteroCsv: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/api/papers/import/zotero-csv`, { method: "POST", headers: mergeHeaders(), body: formData });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ total: number; imported: number; errors: number; results: { filename: string; status: string; paper_id?: string; title?: string; error?: string }[] }>;
  },

  importZoteroCsvWithPdfs: async (file: File, zoteroDataDir: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("zotero_data_dir", zoteroDataDir);
    const res = await fetch(`${BASE_URL}/api/papers/import/zotero-csv-pdf`, { method: "POST", headers: mergeHeaders(), body: formData });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{
      total: number;
      imported: number;
      duplicates: number;
      errors: number;
      pdf_imported: number;
      pdf_not_found: number;
      results: {
        filename: string;
        status: string;
        paper_id?: string;
        title?: string;
        error?: string;
        pdf_status?: string;
        pdf_error?: string;
        page_count?: number;
      }[]
    }>;
  },

  syncZoteroSqlite: () =>
    request<{
      total: number;
      imported: number;
      duplicates: number;
      errors: number;
      pdf_imported: number;
      results: { title: string; paper_id?: string; status: string; pdf_status?: string }[];
    }>("POST", "/api/papers/import/zotero-sqlite-sync"),

  // Search
  search: (text: string, paperIds?: string[], topK = 10, filters?: SearchFilters) =>
    request<{ query: string; total: number; results: SearchResult[]; clustered?: SearchResultCluster[] }>("POST", "/api/search", {
      text,
      paper_ids: paperIds,
      top_k: topK,
      filters,
    }),

  searchWithSignal: async (text: string, paperIds?: string[], topK = 10, filters?: SearchFilters, signal?: AbortSignal) => {
    const res = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      headers: mergeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text, paper_ids: paperIds, top_k: topK, filters }),
      signal,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ query: string; total: number; results: SearchResult[]; clustered?: SearchResultCluster[] }>;
  },

  searchSuggest: (q: string) =>
    request<{ suggestions: string[]; tags?: string[]; papers?: { id: string; title: string }[] }>(
      "GET", `/api/search/suggest?q=${encodeURIComponent(q)}`
    ),

  searchSuggestWithSignal: async (q: string, signal?: AbortSignal) => {
    const res = await fetch(`${BASE_URL}/api/search/suggest?q=${encodeURIComponent(q)}`, { headers: mergeHeaders(), signal });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ suggestions: string[]; tags?: string[]; papers?: { id: string; title: string }[] }>;
  },

  // Chat
  suggestQuestions: (scope: string, paperIds?: string[], collectionId?: string) =>
    request<{ questions: string[] }>("POST", "/api/chat/suggest-questions", { scope, paper_ids: paperIds, collection_id: collectionId }),

  chat: (message: string, paperIds?: string[], scope?: string, collectionId?: string, reasoningMode?: string) =>
    request<ChatResponse>("POST", "/api/chat", { message, paper_ids: paperIds, scope, collection_id: collectionId, reasoning_mode: reasoningMode }),

  chatCollection: (message: string, collectionId: string) =>
    request<ChatResponse>("POST", "/api/chat", { message, scope: "collection", collection_id: collectionId }),

  chatStream: (
    message: string,
    paperIds: string[] | undefined,
    scope?: string,
    sessionId: string = "default",
    collectionId?: string,
    reasoningMode?: string,
    strictEvidence?: boolean,
  ) => {
    const url = `${BASE_URL}/api/chat`;
    const body = JSON.stringify({ message, paper_ids: paperIds, scope, stream: true, session_id: sessionId, collection_id: collectionId, reasoning_mode: reasoningMode, strict_evidence: strictEvidence });
    const controller = new AbortController();
    const stream: {
      onChunk: ((text: string) => void) | null;
      onStatus: ((text: string) => void) | null;
      onDone: ((model: string, citations: any[], router_reason?: string, token_count?: number, modified_content?: string, warning?: string) => void) | null;
      onError: ((err: string) => void) | null;
      abort: () => void;
    } = { onChunk: null, onStatus: null, onDone: null, onError: null, abort: () => controller.abort() };

    (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: mergeHeaders({ "Content-Type": "application/json" }),
          body,
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.text();
          stream.onError?.(err || `HTTP ${res.status}`);
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          stream.onError?.("No response body");
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              try {
                const data = JSON.parse(dataStr);
                if (data.done) {
                  stream.onDone?.(data.model_used || "", data.citations || [], data.router_reason || "", data.token_count || 0, data.modified_content || "", data.warning || "");
                } else if (data.status !== undefined) {
                  stream.onStatus?.(data.status);
                } else if (data.chunk !== undefined) {
                  stream.onChunk?.(data.chunk);
                }
              } catch {
                // skip
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          stream.onError?.(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return stream;
  },

  review: (query: string, paperIds?: string[], collectionId?: string) =>
    request<ChatResponse>("POST", "/api/review", { query, paper_ids: paperIds, collection_id: collectionId }),
  critique: (query: string, paperIds?: string[], collectionId?: string) =>
    request<ChatResponse>("POST", "/api/critique", { query, paper_ids: paperIds, collection_id: collectionId }),
  debate: (query: string, paperIds?: string[], collectionId?: string) =>
    request<ChatResponse>("POST", "/api/debate", { query, paper_ids: paperIds, collection_id: collectionId }),

  // Deep Research
  deepResearch: (query: string, paperIds?: string[], topK: number = 3) =>
    request<DeepResearchResponse>("POST", "/api/research/deep", { query, paper_ids: paperIds, top_k: topK }),

  decomposeQuery: (query: string) =>
    request<DecomposeResponse>("POST", "/api/research/decompose", { query }),
  verify: (query: string, paperIds?: string[], collectionId?: string) =>
    request<VerifyResponse>("POST", "/api/verify", { message: query, paper_ids: paperIds, collection_id: collectionId }),

  verifyStream: (
    message: string,
    paperIds: string[] | undefined,
    sessionId: string = "verify",
    collectionId?: string,
  ) => {
    const url = `${BASE_URL}/api/verify`;
    const body = JSON.stringify({ message, paper_ids: paperIds, collection_id: collectionId, stream: true, session_id: sessionId });
    const controller = new AbortController();
    const stream: {
      onAcademic: ((data: any[], status: string) => void) | null;
      onChunk: ((text: string) => void) | null;
      onDone: ((model: string, citations: any[], externalSources: any[], status: string) => void) | null;
      onError: ((err: string) => void) | null;
      abort: () => void;
    } = { onAcademic: null, onChunk: null, onDone: null, onError: null, abort: () => controller.abort() };

    (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: mergeHeaders({ "Content-Type": "application/json" }),
          body,
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.text();
          stream.onError?.(err || `HTTP ${res.status}`);
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          stream.onError?.("No response body");
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              try {
                const data = JSON.parse(dataStr);
                if (data.type === "academic") {
                  stream.onAcademic?.(data.data || [], data.verify_status || "local_only");
                } else if (data.type === "chunk") {
                  stream.onChunk?.(data.chunk || "");
                } else if (data.type === "done") {
                  stream.onDone?.(data.model_used || "", data.citations || [], data.external_sources || [], data.verify_status || "local_only");
                }
              } catch {
                // skip
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          stream.onError?.(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return stream;
  },
  academicLookupDoi: (doi: string) =>
    request<{ source: string; data: any }>("GET", `/api/academic/doi?doi=${encodeURIComponent(doi)}`),
  academicLookupPaper: (doi: string) =>
    request<{ source: string; data: any }>("GET", `/api/academic/paper?doi=${encodeURIComponent(doi)}`),
  invalidateAcademicCache: (doi: string) =>
    request<{ status: string; doi: string; message: string }>("DELETE", `/api/academic/cache/${encodeURIComponent(doi)}`),
  discoverPapers: (query: string, limit = 20, filters?: { year_from?: number; year_to?: number; open_access_only?: boolean }) =>
    request<{ results: DiscoveredPaper[]; meta?: Record<string, unknown> }>("POST", "/api/academic/discover", { query, limit, ...filters }),
  importPaperByMetadata: (meta: {
    doi?: string; title: string; authors?: string[]; year?: number; journal?: string; abstract?: string
  }) => request<{ paper_id: string; title: string; status: string }>("POST", "/api/papers/import/metadata", meta),
  translatePapers: (papers: { title: string; abstract: string }[]) =>
    request<{ translations: { title_vi: string; abstract_vi: string }[] }>("POST", "/api/academic/translate", { papers }),

  // Collections / Projects
  listCollections: () =>
    request<{ collections: Collection[] }>("GET", "/api/collections"),

  createCollection: (name: string, description = "") =>
    request<Collection>("POST", "/api/collections", { name, description }),

  updateCollection: (id: string, update: Partial<Collection>) =>
    request<Collection>("PATCH", `/api/collections/${id}`, update),

  deleteCollection: (id: string) =>
    request<{ status: string; collection_id: string }>("DELETE", `/api/collections/${id}`),

  listCollectionPapers: (id: string) =>
    request<{ collection_id: string; paper_ids: string[] }>("GET", `/api/collections/${id}/papers`),

  addPapersToCollection: (id: string, paperIds: string[]) =>
    request<{ status: string; added: number; collection_id: string }>("POST", `/api/collections/${id}/papers`, { paper_ids: paperIds }),

  removePaperFromCollection: (id: string, paperId: string) =>
    request<{ status: string; removed: number }>("DELETE", `/api/collections/${id}/papers/${paperId}`),

  listSavedSearches: () =>
    request<{ saved_searches: SavedSearch[] }>("GET", "/api/saved-searches"),

  createSavedSearch: (name: string, query: string, filters: SearchFilters) =>
    request<SavedSearch>("POST", "/api/saved-searches", { name, query, filters }),

  deleteSavedSearch: (id: string) =>
    request<{ status: string; saved_search_id: string }>("DELETE", `/api/saved-searches/${id}`),

  listProjects: () =>
    request<{ projects: ResearchProject[] }>("GET", "/api/projects"),

  getProject: (projectId: string) =>
    request<ResearchProjectDetail>("GET", `/api/projects/${projectId}`),

  createProject: (title: string, researchQuestion = "") =>
    request<Pick<ResearchProject, "id" | "workspace_id" | "title">>("POST", "/api/projects", {
      title,
      research_question: researchQuestion,
    }),

  updateProject: (projectId: string, update: Partial<Pick<ResearchProject, "title" | "description" | "research_question" | "status">>) =>
    request<Pick<ResearchProject, "id" | "title" | "status">>("PATCH", `/api/projects/${projectId}`, update),

  addProjectPapers: (projectId: string, paperIds: string[]) =>
    request<{ added: number }>("POST", `/api/projects/${projectId}/papers`, { paper_ids: paperIds }),

  deleteProject: (projectId: string) =>
    request<{ status: string }>("DELETE", `/api/projects/${projectId}`),

  listScreeningDecisions: (projectId?: string, stage = "title_abstract") =>
    request<{ decisions: ScreeningDecisionRecord[] }>(
      "GET",
      `/api/screening/decisions?stage=${stage}${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ""}`,
    ),

  saveScreeningDecision: (paperId: string, decision: ScreeningDecisionRecord["decision"], reason = "", projectId?: string, stage = "title_abstract") =>
    request<ScreeningDecisionRecord>("PUT", `/api/screening/decisions/${paperId}`, {
      decision, reason, project_id: projectId, stage,
    }),

  clearScreeningDecision: (paperId: string, projectId?: string, stage = "title_abstract") =>
    request<{ deleted: number }>(
      "DELETE",
      `/api/screening/decisions/${paperId}?stage=${stage}${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ""}`,
    ),

  getPrismaCounts: (projectId?: string) =>
    request<PrismaCounts>("GET", `/api/screening/prisma${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),

  getProjectAudit: (projectId: string) =>
    request<{ events: ReviewAuditEvent[] }>("GET", `/api/projects/${projectId}/audit`),
  listProjectArtifacts: (projectId: string) =>
    request<{ artifacts: ResearchArtifact[] }>("GET", `/api/projects/${projectId}/artifacts`),
  createProjectArtifact: (projectId: string, artifact: { artifact_type: ResearchArtifact["artifact_type"]; title: string; content?: string; source_id?: string }) =>
    request<Pick<ResearchArtifact, "id" | "artifact_type" | "title">>("POST", `/api/projects/${projectId}/artifacts`, artifact),
  listLivingReviews: (projectId: string) =>
    request<{ subscriptions: LivingReviewSubscription[] }>("GET", `/api/projects/${projectId}/living-reviews`),
  createLivingReview: (projectId: string, name: string, query: string) =>
    request<LivingReviewSubscription>("POST", `/api/projects/${projectId}/living-reviews`, { name, query }),
  checkLivingReview: (subscriptionId: string) =>
    request<{ subscription_id: string; count: number; matches: Array<Pick<Paper, "id" | "title" | "authors" | "year" | "created_at">> }>("POST", `/api/living-reviews/${subscriptionId}/check`),
  listWorkspaceMembers: (workspaceId: string) =>
    request<{ members: WorkspaceMember[] }>("GET", `/api/workspaces/${workspaceId}/members`),
  addWorkspaceMember: (workspaceId: string, identity: string, role: WorkspaceMember["role"]) =>
    request<Pick<WorkspaceMember, "id" | "identity" | "role">>("POST", `/api/workspaces/${workspaceId}/members`, { identity, role }),

  listBackups: () => request<{ backups: DataBackup[] }>("GET", "/api/backups"),
  createBackup: () => request<{ name: string; size: number }>("POST", "/api/backups"),
  restoreBackup: (name: string) =>
    request<{ status: string; requires_restart: boolean }>("POST", `/api/backups/${encodeURIComponent(name)}/restore`),
  exportPortableData: () =>
    fetch(`${BASE_URL}/api/privacy/export`, { headers: mergeHeaders() }).then((response) => {
      if (!response.ok) throw new Error(`Export failed: HTTP ${response.status}`);
      return response.blob();
    }),

  listAnnotations: (paperId: string) =>
    request<{ annotations: PdfAnnotation[] }>("GET", `/api/papers/${paperId}/annotations`),

  createAnnotation: (paperId: string, annotation: {
    page_number: number;
    kind: PdfAnnotation["kind"];
    quote_text?: string;
    note?: string;
    color?: PdfAnnotation["color"];
    project_id?: string;
  }) => request<PdfAnnotation>("POST", `/api/papers/${paperId}/annotations`, annotation),

  updateAnnotation: (annotationId: string, update: Partial<Pick<PdfAnnotation, "quote_text" | "note" | "color" | "tags">>) =>
    request<PdfAnnotation>("PATCH", `/api/annotations/${annotationId}`, update),

  deleteAnnotation: (annotationId: string) =>
    request<{ status: string }>("DELETE", `/api/annotations/${annotationId}`),

  getReadingProgress: (paperId: string) =>
    request<{ paper_id: string; current_page: number; zoom: number }>("GET", `/api/papers/${paperId}/reading-progress`),

  saveReadingProgress: (paperId: string, currentPage: number, zoom = 100) =>
    request<{ paper_id: string; current_page: number; zoom: number }>(
      "PUT",
      `/api/papers/${paperId}/reading-progress`,
      { current_page: currentPage, zoom },
    ),

  saveHighlightedPdf: (paperId: string, highlights: Array<{ page: number; text: string; note?: string }>, projectId?: string) =>
    request<{ status: string; file_path: string; highlights_saved: number; download_url: string }>(
      "POST",
      `/api/papers/${paperId}/save-highlighted-pdf`,
      { highlights, project_id: projectId },
    ),

  // Machine specs
  detectSpecs: () =>
    request<{
      total_ram_gb: number;
      cpu_cores: number;
      suggested_tier: string;
      suggested_model: string;
    }>("GET", "/api/detect-specs"),

  // Stats
  stats: () => request<Stats>("GET", "/api/stats"),

  // Settings
  getSettings: () =>
    request<{
      llama_server_url: string;
      local_model: string;
      llm_mode: string;
      claude_api_key: string;
      claude_model: string;
      deepseek_api_key: string;
      deepseek_model: string;
      gemini_api_key: string;
      gemini_model: string;
      groq_api_key: string;
      groq_model: string;
      nvidia_api_key: string;
      nvidia_model: string;
      nvidia_url: string;
      github_api_key: string;
      github_model: string;
      custom_cloud_provider: string;
      chunk_size: number;
      chunk_overlap: number;
      top_k_retrieval: number;
      embedding_model: string;
      embedding_mode: string;
      setup_completed: boolean;
      enable_reranker: boolean;
      task_provider_map: string;
      task_fallback_map: string;
      ai_daily_token_budget: number;
    }>("GET", "/api/settings"),

  updateSettings: (settings: Record<string, unknown>) =>
    request<{ status: string }>("PUT", "/api/settings", settings),

  // Usage
  getChatUsage: () =>
    request<{
      used: number;
      limit: number;
      remaining: number;
      mode: string;
    }>("GET", "/api/chat/usage"),

  // Embedding
  testEmbedding: () =>
    request<{ success: boolean; dimension?: number; message?: string; error?: string }>("POST", "/api/settings/test-embedding"),

  // Key Validation
  validateApiKey: (provider: string, apiKey: string, model?: string) =>
    request<{ valid: boolean; error?: string }>("POST", "/api/settings/validate-key", {
      provider,
      api_key: apiKey,
      model,
    }),

  // Cache Management
  getCacheStats: () =>
    request<{ llm_cache_count: number; embedding_cache_count: number }>("GET", "/api/settings/cache-stats"),

  clearCache: () =>
    request<{ status: string; message: string }>("POST", "/api/settings/cache-clear"),

  getModelStatus: () =>
    request<{
      embedder: { loaded: boolean; last_used: number; idle_seconds: number; model_name: string };
      reranker: { loaded: boolean; last_used: number; idle_seconds: number; model_name: string };
    }>("GET", "/api/settings/model-status"),

  // Local model (llama-server) status
  getLocalStatus: () =>
    request<{ connected: boolean; error?: string; llama_server_url: string; model?: string }>("GET", "/api/local/status"),

  // Data Management
  openDataFolder: (path?: string) =>
    request<{ success: boolean; message: string }>("POST", "/api/data/open-folder", { path }),

  clearAllData: () =>
    request<{ success: boolean; message: string }>("POST", "/api/data/clear-data"),

  resetApp: () =>
    request<{ success: boolean; message: string }>("POST", "/api/data/reset-app"),

  moveStorage: (newPath: string) =>
    request<{ success: boolean; message: string }>("POST", "/api/data/move-storage", { new_path: newPath }),

  getDiskSpace: (path: string) =>
    request<{ total_gb: number; used_gb: number; free_gb: number; warning: boolean }>(
      "GET",
      `/api/data/disk-space?path=${encodeURIComponent(path)}`
    ),

  // Insights
  findResearchGap: (paperIds?: string[], collectionId?: string) =>
    request<ChatResponse>("POST", "/api/insights/gap", { paper_ids: paperIds, collection_id: collectionId }),

  findConflicts: (paperIds?: string[]) =>
    request<ChatResponse>("POST", "/api/insights/conflict", { paper_ids: paperIds }),

  findTopicSuggestions: (paperIds?: string[]) =>
    request<ChatResponse>("POST", "/api/insights/topic", { paper_ids: paperIds }),

  findEvolutionMap: (paperIds?: string[]) =>
    request<ChatResponse>("POST", "/api/insights/evolution", { paper_ids: paperIds }),

  comparePapers: (paperIds?: string[]) =>
    request<{
      answer: string;
      citations: any[];
      model_used: string;
      papers_used: string[];
      chunks_used: number;
      matrix: { columns: string[]; rows: string[][] };
    }>("POST", "/api/insights/compare", { paper_ids: paperIds }),

  // Highlights
  findHighlights: (paperId: string, limit = 10) =>
    request<{ highlights: Highlight[]; paper_id: string; paper_title?: string; message?: string }>(
      "GET",
      `/api/papers/${paperId}/highlights?limit=${limit}`
    ),

  // Auto-Cite
  citePapers: (paperIds: string[], style: string = "apa") =>
    request<CiteResponse>("POST", "/api/papers/cite", { paper_ids: paperIds, style }),

  // Related Papers
  findRelatedPapers: (paperId: string, limit = 5) =>
    request<{ related_papers: RelatedPaper[]; paper_id: string; model_info: { name: string; mode: string } }>(
      "GET",
      `/api/papers/${paperId}/related?limit=${limit}`
    ),

  getRelatedPaperMatches: (paperId: string, otherPaperId: string, limit = 10) =>
    request<RelatedPaperMatchesResponse>(
      "GET",
      `/api/papers/${paperId}/related/${otherPaperId}/matches?limit=${limit}`
    ),

  // Paper Export
  exportPaperHtml: (paperId: string) =>
    fetch(`${BASE_URL}/api/papers/${paperId}/export/html`, { headers: mergeHeaders() }).then((res) => {
      if (!res.ok) throw new Error(`Export HTML failed: ${res.status}`);
      return res.blob();
    }),

  exportPaperDocx: (paperId: string) =>
    fetch(`${BASE_URL}/api/papers/${paperId}/export/docx`, { headers: mergeHeaders() }).then((res) => {
      if (!res.ok) throw new Error(`Export DOCX failed: ${res.status}`);
      return res.blob();
    }),

  exportSynthesis: (title: string, content: string, format: string) =>
    fetch(`${BASE_URL}/api/papers/export/synthesis`, {
      method: "POST",
      headers: mergeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title, content, format }),
    }).then((res) => {
      if (!res.ok) throw new Error(`Export Synthesis failed: ${res.status}`);
      return res.blob();
    }),

  // Zotero
  detectZoteroDataDir: () =>
    request<{
      found: boolean;
      path: string | null;
      method: string;
      has_storage: boolean;
      message: string;
    }>("GET", "/api/zotero/detect"),

  saveZoteroPath: (path: string) =>
    request<{ status: string; path: string }>("POST", "/api/zotero/save-path", { path }),

  // Personal Knowledge Brain
  getPersonalBrain: () =>
    request<PersonalBrainResponse>("GET", "/api/personal/brain"),

  // Daily AI Reader
  getDailyReader: () =>
    request<DailyReaderResponse>("GET", "/api/personal/daily-reader"),

  // Literature Review Builder
  generateReviewDraft: (paperIds: string[], title?: string, sections?: string[]) =>
    request<ReviewDraftResponse>("POST", "/api/review/builder/draft", {
      paper_ids: paperIds,
      title,
      sections,
    }),

  generateReviewDraftStream: (
    paperIds: string[],
    title: string | undefined,
    sections: string[] | undefined,
    handlers: {
      onStart?: (payload: { title: string; paper_titles: string[]; sections: string[] }) => void;
      onSection?: (section: ReviewSection) => void;
      onDone?: (fullText: string) => void;
      onError?: (error: string) => void;
    },
  ) => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/review/builder/draft/stream`, {
          method: "POST",
          headers: mergeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ paper_ids: paperIds, title, sections }),
          signal: controller.signal,
        });
        if (!res.ok) {
          handlers.onError?.(await res.text());
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          handlers.onError?.("No response body");
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6).trim());
              if (data.type === "start") handlers.onStart?.(data);
              else if (data.type === "section") handlers.onSection?.(data.section);
              else if (data.type === "done") handlers.onDone?.(data.full_text || "");
              else if (data.type === "error") handlers.onError?.(data.error || "Review stream failed");
            } catch {
              // Ignore malformed SSE frames.
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") handlers.onError?.(err instanceof Error ? err.message : String(err));
      }
    })();
    return { abort: () => controller.abort() };
  },

  generateReviewSection: (paperIds: string[], section: string, useCache: boolean = true) =>
    request<ReviewSectionResponse>("POST", "/api/review/builder/section", {
      paper_ids: paperIds,
      section,
      use_cache: useCache,
    }),

  generateReviewMatrix: (paperIds: string[], useCache: boolean = false) =>
    request<ReviewMatrixResponse>("POST", "/api/review/builder/matrix", {
      paper_ids: paperIds,
      use_cache: useCache,
    }),

  exportReview: (title: string, content: string, format: string) =>
    fetch(`${BASE_URL}/api/review/builder/export`, {
      method: "POST",
      headers: mergeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title, content, format }),
    }).then((res) => {
      if (!res.ok) throw new Error(`Export Review failed: ${res.status}`);
      return res.blob();
    }),

  generateOutline: (paperIds: string[], existingSections?: OutlineSection[]) =>
    request<OutlineResponse>("POST", "/api/review/builder/outline", {
      paper_ids: paperIds,
      existing_sections: existingSections,
    }),

  getEvidence: (paperIds: string[], section: string, topK?: number) =>
    request<EvidenceResponse>("POST", "/api/review/builder/evidence", {
      paper_ids: paperIds,
      section,
      top_k: topK || 10,
    }),

  saveReviewDraft: (data: {
    id?: string;
    title: string;
    paper_ids: string[];
    paper_titles: string[];
    outline_sections: OutlineSection[];
    sections: Record<string, ReviewSection>;
    full_text: string;
    create_version?: boolean;
  }) =>
    request<{ id: string; status: string; error?: string; versions_count?: number }>("POST", "/api/review/builder/save", data),

  listReviewDrafts: () =>
    request<{ drafts: ReviewDraftSummary[] }>("GET", "/api/review/builder/drafts"),

  loadReviewDraft: (draftId: string) =>
    request<ReviewDraftData>("GET", `/api/review/builder/draft/${draftId}`),

  deleteReviewDraft: (draftId: string) =>
    request<{ status: string; error?: string }>("DELETE", `/api/review/builder/draft/${draftId}`),

  renameReviewDraft: (draftId: string, title: string) =>
    request<{ status: string; error?: string; id?: string; title?: string }>("PATCH", `/api/review/builder/draft/${draftId}/rename`, {
      title,
    }),

  listDraftVersions: (draftId: string) =>
    request<{ versions: DraftVersionSummary[] }>("GET", `/api/review/builder/draft/${draftId}/versions`),

  loadDraftVersion: (draftId: string, versionIdx: number) =>
    request<DraftVersionData>("GET", `/api/review/builder/draft/${draftId}/versions/${versionIdx}`),

  restoreDraftVersion: (draftId: string, versionIdx: number) =>
    request<{ status: string; error?: string }>("POST", `/api/review/builder/draft/${draftId}/versions/${versionIdx}/restore`),

  checkQuality: (title: string, sections: Record<string, ReviewSection>) =>
    request<QualityCheckResponse>("POST", "/api/review/builder/check-quality", {
      title,
      sections,
    }),

  generateEvidenceMatrix: (paperIds: string[], useCache: boolean = false) =>
    request<EvidenceMatrixResponse>("POST", "/api/review/builder/evidence-matrix", {
      paper_ids: paperIds,
      use_cache: useCache,
    }),

  // Evidence Matrix Drafts (server-side)
  saveEvidenceMatrixDraft: (data: {
    id?: string;
    title: string;
    paper_ids: string[];
    paper_names: string[];
    columns: string[];
    rows: EvidenceMatrixRow[];
  }) =>
    request<{ id: string; status: string; error?: string }>("POST", "/api/review/builder/evidence-matrix/save", data),

  listEvidenceMatrixDrafts: () =>
    request<{ drafts: EvidenceMatrixDraftSummary[] }>("GET", "/api/review/builder/evidence-matrix/drafts"),

  loadEvidenceMatrixDraft: (draftId: string) =>
    request<EvidenceMatrixDraftData>("GET", `/api/review/builder/evidence-matrix/draft/${draftId}`),

  deleteEvidenceMatrixDraft: (draftId: string) =>
    request<{ status: string; error?: string }>("DELETE", `/api/review/builder/evidence-matrix/draft/${draftId}`),

  renameEvidenceMatrixDraft: (draftId: string, title: string) =>
    request<{ status: string; error?: string; id?: string; title?: string }>("PATCH", `/api/review/builder/evidence-matrix/draft/${draftId}/rename`, {
      title,
    }),

  analyzeClaims: (text: string, citations: any[]) =>
    request<ClaimAnalysisResponse>("POST", "/api/chat/analyze-claims", {
      text,
      citations,
    }),

  // ─── GraphRAG ───────────────────────────────────────────

  buildGraph: (paperIds?: string[], entityTypes?: string[], maxGleanings?: number) =>
    request<{ status: string; message: string; total_chunks?: number }>("POST", "/api/graph/build", {
      paper_ids: paperIds,
      entity_types: entityTypes,
      max_gleanings: maxGleanings ?? 1,
    }),

  queryGraph: (query: string, strategy: string = "local", opts?: {
    topKEntities?: number;
    topKRelationships?: number;
    maxDriftSteps?: number;
  }) =>
    request<{ answer: string; strategy: string; stats: Record<string, number> }>("POST", "/api/graph/query", {
      query,
      strategy,
      top_k_entities: opts?.topKEntities ?? 10,
      top_k_relationships: opts?.topKRelationships ?? 10,
      max_drift_steps: opts?.maxDriftSteps ?? 3,
    }),

  getGraphStats: () =>
    request<GraphStats>("GET", "/api/graph/stats"),

  listGraphEntities: (limit = 50, offset = 0) =>
    request<GraphEntity[]>("GET", `/api/graph/entities?limit=${limit}&offset=${offset}`),

  getGraphEntity: (title: string) =>
    request<GraphEntity>("GET", `/api/graph/entities/${encodeURIComponent(title)}`),

  listGraphCommunities: () =>
    request<GraphCommunity[]>("GET", "/api/graph/communities"),

  getGraphVisualizationData: () =>
    request<GraphVisualizationData>("GET", "/api/graph/graph-data"),

  getBuildProgress: () =>
    request<{ phase: string; current: number; total: number; percent: number; message: string }>("GET", "/api/graph/build-progress"),

  cancelBuild: () =>
    request<{ status: string; message: string }>("POST", "/api/graph/build/cancel"),

  clearGraph: () =>
    request<{ status: string; message: string }>("POST", "/api/graph/clear"),

  // Anonymization API
  anonymization,
};

// ─── Review Builder Types ────────────────────────────────

export interface ReviewSection {
  section: string;
  title: string;
  content: string;
  papers_used: string[];
  chunks_used: number;
  model_used?: string;
  error?: string;
  citations?: { paper_id: string; paper_title: string; citation_text: string }[];
}

export interface ReviewDraftResponse {
  title: string;
  paper_titles: string[];
  sections: ReviewSection[];
  full_text: string;
  error?: string;
}

export interface ReviewSectionResponse {
  section: string;
  title: string;
  content: string;
  papers_used: string[];
  chunks_used: number;
  model_used?: string;
  error?: string;
  citations?: { paper_id: string; paper_title: string; citation_text: string }[];
}

export interface ReviewMatrixResponse {
  matrix: { columns: string[]; rows: string[][] };
  markdown: string;
  error?: string;
}

export interface OutlineSection {
  key: string;
  title: string;
  description: string;
}

export interface OutlineResponse {
  sections: OutlineSection[];
  paper_titles: string[];
  error?: string;
}

export interface EvidenceItem {
  chunk_id: string;
  paper_id: string;
  paper_title: string;
  content: string;
  page_number: number | null;
  score: number;
}

export interface EvidenceResponse {
  section: string;
  total_chunks: number;
  papers_used: string[];
  evidence: EvidenceItem[];
  error?: string;
}

export interface ReviewDraftSummary {
  id: string;
  title: string;
  paper_count: number;
  section_count: number;
  updated_at: string;
  created_at: string;
}

export interface ReviewDraftData {
  id: string;
  title: string;
  paper_ids: string[];
  paper_titles: string[];
  outline_sections: OutlineSection[];
  sections: Record<string, ReviewSection>;
  full_text: string;
  created_at: string;
  updated_at: string;
  error?: string;
}

export interface DraftVersionSummary {
  index: number;
  saved_at: string;
  title: string;
  section_count: number;
  paper_count: number;
}

export interface DraftVersionData {
  title: string;
  paper_ids: string[];
  paper_titles: string[];
  outline_sections: OutlineSection[];
  sections: Record<string, ReviewSection>;
  full_text: string;
  saved_at: string;
  error?: string;
}

export interface QualityIssue {
  severity: "high" | "medium" | "low";
  section: string;
  type: "missing_citation" | "unsourced_claim" | "repetition" | "contradiction" | "length_too_short" | "length_too_long" | "other";
  message: string;
  action: "add_citation" | "trim_content" | "expand_content" | "review_conflict" | "regenerate" | "none";
  action_label: string;
}

export interface QualityCheckResponse {
  issues: QualityIssue[];
  error?: string;
}

// ─── Verify Types ────────────────────────────────────────

export interface ExternalSource {
  doi: string;
  title: string;
  openalex: {
    citation_count: number;
    publication_year: number | null;
    related_count: number;
    openalex_id: string;
  } | null;
  crossref: {
    authors: string[];
    journal: string | null;
    year: number | null;
    publisher: string | null;
    citation_count: number;
    is_valid: boolean;
  } | null;
  recent_citing: Array<{
    title: string;
    publication_year: number;
    doi?: string;
  }>;
  semantic_scholar?: {
    paper_id: string;
    citation_count: number;
    influential_citation_count: number;
    venue: string | null;
  } | null;
  s2_citations?: Array<{
    title: string;
    year: number | null;
    citation_count: number;
  }>;
  s2_recommendations?: Array<{
    title: string;
    year: number | null;
    citation_count: number;
  }>;
}

export interface VerifyResponse {
  answer: string;
  citations: { source: string; page: number | null; text: string }[];
  model_used: string;
  papers_used: string[];
  external_sources: ExternalSource[];
  verify_status: "full" | "partial" | "local_only";
}

// ─── Daily Reader Types ─────────────────────────────────────

export interface DailyReaderResponse {
  daily_suggestion: {
    suggestion: string;
    model_used: string;
  } | null;
  unread_papers: DailyPaper[];
  reading_streak: number;
  stats: {
    total: number;
    unread: number;
    reading: number;
    read: number;
  };
}

export interface DailyPaper {
  paper_id: string;
  title: string;
  authors: string;
  year: number | null;
  pages: number;
  tags: string[];
  starred: boolean;
  has_summary: boolean;
}

// ─── Personal Brain Types ───────────────────────────────────

export interface PersonalBrainResponse {
  reading_stats: {
    total_papers: number;
    read_count: number;
    reading_count: number;
    unread_count: number;
    starred_count: number;
    total_pages: number;
    languages: Record<string, number>;
    read_percentage: number;
    average_reading_minutes?: number;
    estimated_total_reading_minutes?: number;
  };
  topic_interests: {
    top_tags: { topic: string; count: number }[];
    top_keywords: { keyword: string; count: number }[];
    top_query_topics: { topic: string; count: number }[];
  };
  research_profile?: {
    primary_fields: { field: string; count: number }[];
    top_venues: { venue: string; count: number }[];
    ai_modes: { mode: string; count: number }[];
  };
  author_preferences: {
    top_authors: { author: string; count: number }[];
  };
  timeline: { month: string; count: number }[];
  recent_activity: { type: string; content: string; date: string | null }[];
  insights: { type: string; title: string; description: string; action?: string }[];
}

// ─── GraphRAG Types ────────────────────────────────────────

export interface GraphStats {
  entities: number;
  relationships: number;
  communities: number;
  community_reports: number;
  text_units: number;
}

export interface GraphEntity {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  rank: number;
  community_ids: string[];
  relationships: { source: string; target: string; weight: number; description?: string }[];
}

export interface GraphCommunity {
  id: string;
  title: string;
  level: number;
  size: number;
  report: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  rank: number;
  community_id: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  description?: string;
}

export interface GraphVisualizationData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Evidence Matrix Types ──────────────────────────────────

export interface EvidenceCellData {
  paper_id: string;
  paper_title: string;
  value: string;
  quote: string;
  page: number | null;
  confidence: "high" | "medium" | "low";
  status: "ai_extracted" | "user_verified";
}

export interface EvidenceMatrixRow {
  criterion: string;
  cells: EvidenceCellData[];
}

export interface EvidenceMatrixData {
  columns: string[];
  rows: EvidenceMatrixRow[];
}

export interface EvidenceMatrixResponse {
  matrix: EvidenceMatrixData;
  error?: string;
}

export interface EvidenceMatrixDraftSummary {
  id: string;
  title: string;
  paper_names: string[];
  paper_count: number;
  criterion_count: number;
  updated_at: string | null;
  created_at: string | null;
}

export interface EvidenceMatrixDraftData {
  id: string;
  title: string;
  paper_ids: string[];
  paper_names: string[];
  columns: string[];
  rows: EvidenceMatrixRow[];
  created_at: string | null;
  updated_at: string | null;
  error?: string;
}

// ─── Academic Discovery Types ──────────────────────────────

export interface DiscoveredPaper {
  source: "openalex" | "semantic_scholar";
  doi: string;
  title: string;
  authors: string[];
  year: number | null;
  citation_count: number;
  journal: string;
  abstract: string;
  openalex_id?: string;
  s2_paper_id?: string;
  pdf_url?: string;
}

// ─── Claim Analysis Types ───────────────────────────────────

export interface ClaimAnalysis {
  total_claims: number;
  cited_claims: number;
  uncited_claims: number;
  direct_sources: number;
  indirect_sources: number;
  suspicious_citations: number;
  confidence_score: number;
  uncited_claim_texts: string[];
  suspicious_citation_texts: string[];
}

export interface ClaimAnalysisResponse {
  analysis: ClaimAnalysis | null;
  error?: string;
}
