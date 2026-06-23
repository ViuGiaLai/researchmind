/**
 * ResearchMind VN — FastAPI HTTP client.
 *
 * All API calls to the Python backend go through this module.
 * Backend runs at http://127.0.0.1:8765 by default.
 */

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8765";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error("Không thể kết nối đến backend. Đảm bảo FastAPI đang chạy (cd backend && uvicorn main:app --reload --port 8765).");
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
  read_status: string;
  starred: boolean;
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

export interface ChatResponse {
  answer: string;
  citations: { source: string; page: number | null; text: string }[];
  model_used: string;
  papers_used: string[];
  chunks_used: number;
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
  init_message?: string;
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

// ─── API functions ─────────────────────────────────────────────

export const api = {
  // Health
  health: () => request<HealthResponse>("GET", "/api/health"),

  // Papers
  listPapers: async (page = 1, limit = 20, status?: string, readStatus?: string, starred?: boolean, extra?: {
    collection_id?: string;
    author?: string;
    year_from?: number | null;
    year_to?: number | null;
    tag?: string;
    sort_by?: string;
    order?: string;
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

  importPaper: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/api/papers/import`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(await res.text());
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
        const res = await fetch(`${BASE_URL}/api/jobs/stream?ids=${ids}`, { signal: controller.signal });
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
    const res = await fetch(`${BASE_URL}/api/papers/import/bibtex`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ total: number; imported: number; errors: number; results: { filename: string; status: string; paper_id?: string; title?: string; error?: string }[] }>;
  },

  importZoteroCsv: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/api/papers/import/zotero-csv`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ total: number; imported: number; errors: number; results: { filename: string; status: string; paper_id?: string; title?: string; error?: string }[] }>;
  },

  importZoteroCsvWithPdfs: async (file: File, zoteroDataDir: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("zotero_data_dir", zoteroDataDir);
    const res = await fetch(`${BASE_URL}/api/papers/import/zotero-csv-pdf`, { method: "POST", body: formData });
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
      headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${BASE_URL}/api/search/suggest?q=${encodeURIComponent(q)}`, { signal });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ suggestions: string[]; tags?: string[]; papers?: { id: string; title: string }[] }>;
  },

  // Chat
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
  ) => {
    const url = `${BASE_URL}/api/chat`;
    const body = JSON.stringify({ message, paper_ids: paperIds, scope, stream: true, session_id: sessionId, collection_id: collectionId, reasoning_mode: reasoningMode });
    const controller = new AbortController();
    const stream: {
      onChunk: ((text: string) => void) | null;
      onStatus: ((text: string) => void) | null;
      onDone: ((model: string, citations: any[], router_reason?: string, token_count?: number) => void) | null;
      onError: ((err: string) => void) | null;
      abort: () => void;
    } = { onChunk: null, onStatus: null, onDone: null, onError: null, abort: () => controller.abort() };

    (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
                  stream.onDone?.(data.model_used || "", data.citations || [], data.router_reason || "", data.token_count || 0);
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
    request<VerifyResponse>("POST", "/api/verify", { query, paper_ids: paperIds, collection_id: collectionId }),

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
          headers: { "Content-Type": "application/json" },
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
      custom_cloud_provider: string;
      chunk_size: number;
      chunk_overlap: number;
      top_k_retrieval: number;
      embedding_model: string;
      embedding_mode: string;
      setup_completed: boolean;
      enable_reranker: boolean;
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
  findResearchGap: (paperIds?: string[]) =>
    request<ChatResponse>("POST", "/api/insights/gap", { paper_ids: paperIds }),

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
    request<{ related_papers: RelatedPaper[]; paper_id: string }>(
      "GET",
      `/api/papers/${paperId}/related?limit=${limit}`
    ),

  // Paper Export
  exportPaperHtml: (paperId: string) =>
    fetch(`${BASE_URL}/api/papers/${paperId}/export/html`).then((res) => {
      if (!res.ok) throw new Error(`Export HTML failed: ${res.status}`);
      return res.blob();
    }),

  exportPaperDocx: (paperId: string) =>
    fetch(`${BASE_URL}/api/papers/${paperId}/export/docx`).then((res) => {
      if (!res.ok) throw new Error(`Export DOCX failed: ${res.status}`);
      return res.blob();
    }),

  exportSynthesis: (title: string, content: string, format: string) =>
    fetch(`${BASE_URL}/api/papers/export/synthesis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
          headers: { "Content-Type": "application/json" },
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

  generateReviewSection: (paperIds: string[], section: string) =>
    request<ReviewSectionResponse>("POST", "/api/review/builder/section", {
      paper_ids: paperIds,
      section,
    }),

  generateReviewMatrix: (paperIds: string[]) =>
    request<ReviewMatrixResponse>("POST", "/api/review/builder/matrix", {
      paper_ids: paperIds,
    }),

  exportReview: (title: string, content: string, format: string) =>
    fetch(`${BASE_URL}/api/review/builder/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, format }),
    }).then((res) => {
      if (!res.ok) throw new Error(`Export Review failed: ${res.status}`);
      return res.blob();
    }),

  // ─── GraphRAG ───────────────────────────────────────────

  buildGraph: (paperIds?: string[], entityTypes?: string[], maxGleanings?: number) =>
    request<{ status: string; stats: Record<string, number> }>("POST", "/api/graph/build", {
      paper_ids: paperIds,
      entity_types: entityTypes,
      max_gleanings: maxGleanings ?? 2,
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

  clearGraph: () =>
    request<{ status: string; message: string }>("POST", "/api/graph/clear"),
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
}

export interface ReviewMatrixResponse {
  matrix: { columns: string[]; rows: string[][] };
  markdown: string;
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
  };
  topic_interests: {
    top_tags: { topic: string; count: number }[];
    top_keywords: { keyword: string; count: number }[];
    top_query_topics: { topic: string; count: number }[];
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
