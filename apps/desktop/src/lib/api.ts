/**
 * ResearchMind VN — FastAPI HTTP client.
 *
 * All API calls to the Python backend go through this module.
 * Backend runs at http://127.0.0.1:8765 by default.
 */

const BASE_URL = "http://127.0.0.1:8765";

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
  tags: string;
  notes: string;
  auto_summary: string;
  read_status: string;
  starred: boolean;
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
  ollama_model: string;
  total_papers: number;
  total_chunks: number;
}

export interface Highlight {
  category: string;
  text: string;
  page_hint: number | null;
  importance: string;
  note: string;
}

export interface RelatedPaper {
  paper_id: string;
  title: string;
  similarity: number;
  snippet: string;
  matching_chunks: number;
}

// ─── API functions ─────────────────────────────────────────────

export const api = {
  // Health
  health: () => request<HealthResponse>("GET", "/api/health"),

  // Papers
  listPapers: (page = 1, limit = 20, status?: string) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set("status", status);
    return request<{ total: number; page: number; limit: number; papers: Paper[] }>(
      "GET", `/api/papers?${params}`
    );
  },

  getPaper: (id: string) => request<Paper & { chunk_count: number }>("GET", `/api/papers/${id}`),

  updatePaper: (id: string, update: Partial<Paper>) =>
    request<Paper>("PATCH", `/api/papers/${id}`, update),

  deletePaper: (id: string) => request<{ status: string }>("DELETE", `/api/papers/${id}`),

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

  // Search
  search: (text: string, paperIds?: string[], topK = 10) =>
    request<{ query: string; total: number; results: SearchResult[] }>("POST", "/api/search", {
      text,
      paper_ids: paperIds,
      top_k: topK,
    }),

  searchSuggest: (q: string) =>
    request<{ suggestions: string[] }>("GET", `/api/search/suggest?q=${encodeURIComponent(q)}`),

  // Chat
  chat: (message: string, paperIds?: string[]) =>
    request<ChatResponse>("POST", "/api/chat", { message, paper_ids: paperIds }),

  review: (query: string, paperIds?: string[]) =>
    request<ChatResponse>("POST", "/api/review", { query, paper_ids: paperIds }),
  critique: (query: string, paperIds?: string[]) =>
    request<ChatResponse>("POST", "/api/critique", { query, paper_ids: paperIds }),
  debate: (query: string, paperIds?: string[]) =>
    request<ChatResponse>("POST", "/api/debate", { query, paper_ids: paperIds }),

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
      ollama_url: string;
      ollama_model: string;
      llm_mode: string;
      claude_api_key: string;
      claude_model: string;
      deepseek_api_key: string;
      deepseek_model: string;
      gemini_api_key: string;
      gemini_model: string;
      custom_cloud_provider: string;
      model_tier_weak: string;
      model_tier_medium: string;
      model_tier_strong: string;
      chunk_size: number;
      chunk_overlap: number;
      top_k_retrieval: number;
      embedding_model: string;
      setup_completed: boolean;
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

  // Key Validation
  validateApiKey: (provider: string, apiKey: string, model?: string) =>
    request<{ valid: boolean; error?: string }>("POST", "/api/settings/validate-key", {
      provider,
      api_key: apiKey,
      model,
    }),

  // Ollama Status & Pulling
  getOllamaStatus: () =>
    request<{ connected: boolean; models?: string[]; error?: string; ollama_url: string }>("GET", "/api/ollama/status"),

  pullOllamaModelUrl: "http://127.0.0.1:8765/api/ollama/pull",

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

  // Highlights
  findHighlights: (paperId: string, limit = 10) =>
    request<{ highlights: Highlight[]; paper_id: string; paper_title?: string; message?: string }>(
      "GET",
      `/api/papers/${paperId}/highlights?limit=${limit}`
    ),

  // Related Papers
  findRelatedPapers: (paperId: string, limit = 5) =>
    request<{ related_papers: RelatedPaper[]; paper_id: string }>(
      "GET",
      `/api/papers/${paperId}/related?limit=${limit}`
    ),

  // Personal Knowledge Brain
  getPersonalBrain: () =>
    request<PersonalBrainResponse>("GET", "/api/personal/brain"),

  // Daily AI Reader
  getDailyReader: () =>
    request<DailyReaderResponse>("GET", "/api/personal/daily-reader"),
};

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

