import React, { useEffect, useRef, useState } from "react";
import { api, Collection, SavedSearch, SearchFilters, SearchResult, SearchResultCluster } from "../../lib/api";
import {
  IconSearch,
  IconBrain,
  IconFileText,
  IconSpinner,
  IconChat,
  IconBulb,
  IconChart,
  IconStar,
  IconZap,
  IconBookmark,
  IconFolder,
  IconCalendar,
  IconBookOpen,
  IconUser,
  IconChevronDown,
} from "../Icons";

const SUGGESTED_QUERIES = [
  { icon: <IconBrain size={18} />, text: "Tổng hợp các ý tưởng chính trong thư viện" },
  { icon: <IconChart size={18} />, text: "So sánh phương pháp giữa các paper" },
  { icon: <IconSearch size={18} />, text: "Paper nào nói về transformer" },
  { icon: <IconBulb size={18} />, text: "Xu hướng nghiên cứu gần đây" },
  { icon: <IconFileText size={18} />, text: "Tóm tắt đóng góp chính của các paper" },
  { icon: <IconZap size={18} />, text: "Điểm mạnh và yếu điểm của các phương pháp" },
];

const searchSessionCache = new Map<string, SearchResult[]>();
const makeSearchCacheKey = (query: string, filters: SearchFilters) =>
  JSON.stringify({ query: query.trim().toLowerCase(), filters });

export const SearchView: React.FC<{ onStartChat: (paperIds: string[]) => void }> = ({ onStartChat }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [clustered, setClustered] = useState<SearchResultCluster[]>([]);
  const [expandedPapers, setExpandedPapers] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [embeddingInfo, setEmbeddingInfo] = useState<{ mode: string; pooling: string; normalize: boolean } | null>(null);
  const [visibleResultCount, setVisibleResultCount] = useState(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({
    sort_by: "relevance",
    sort_order: "desc",
    starred: null,
  });

  useEffect(() => {
    api.listCollections().then((res) => setCollections(res.collections)).catch(() => {});
    api.listSavedSearches().then((res) => setSavedSearches(res.saved_searches)).catch(() => {});
    api.getSettings().then((s) => {
      setEmbeddingInfo({
        mode: (s as any).embedding_mode || "local",
        pooling: (s as any).embedding_pooling || "cls",
        normalize: (s as any).normalize_embeddings !== false,
      });
    }).catch(() => {});
  }, []);

  const performSearch = async (searchQuery: string, filterOverride?: SearchFilters) => {
    if (!searchQuery.trim()) return;
    const activeFilters = filterOverride || filters;
    const cacheKey = makeSearchCacheKey(searchQuery, activeFilters);
    const cached = searchSessionCache.get(cacheKey);
    setSearching(true);
    setSearched(true);
    setVisibleResultCount(5);
    if (cached) {
      setResults(cached);
      setSearching(false);
      window.setTimeout(() => setVisibleResultCount(cached.length), 120);
      return;
    }
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    try {
      const started = performance.now();
      const res = await api.searchWithSignal(searchQuery, undefined, 20, activeFilters, controller.signal);
      console.info(`SEARCH_FRONTEND_TIMING total=${(performance.now() - started).toFixed(1)}ms results=${res.results.length}`);
      searchSessionCache.set(cacheKey, res.results);
      setResults(res.results);
      setClustered(res.clustered || []);
      if (res.clustered) {
        setExpandedPapers(new Set(res.clustered.map(c => c.paper_id)));
      }
      window.setTimeout(() => setVisibleResultCount(res.results.length), 120);
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("Search failed:", e);
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setSearching(false);
      }
    }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    suggestAbortRef.current?.abort();
    if (!val.trim()) {
      setSuggestions([]);
      return;
    }
    suggestTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      try {
        const res = await api.searchSuggestWithSignal(val, controller.signal);
        setSuggestions(res.suggestions || []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          // silent
        }
      } finally {
        if (suggestAbortRef.current === controller) suggestAbortRef.current = null;
      }
    }, 180);
  };

  useEffect(() => () => {
    searchAbortRef.current?.abort();
    suggestAbortRef.current?.abort();
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
  }, []);

  const handleSuggestionClick = (text: string, isTag = false) => {
    const queryVal = isTag ? `thẻ:"${text}"` : text;
    setQuery(queryVal);
    performSearch(queryVal);
    setShowSuggestions(false);
  };

  const handleSearch = () => {
    performSearch(query);
    setShowSuggestions(false);
  };

  const saveCurrentSearch = async () => {
    if (!query.trim()) return;
    const name = prompt("Tên saved search:", query.slice(0, 40));
    if (!name) return;
    const saved = await api.createSavedSearch(name, query, filters);
    setSavedSearches((prev) => [saved, ...prev]);
  };

  const applySavedSearch = (saved: SavedSearch) => {
    setQuery(saved.query);
    setFilters(saved.filters || {});
    performSearch(saved.query, saved.filters || {});
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const chatWithResults = () => {
    const paperIds = [...new Set(results.map((r) => r.paper_id))];
    if (paperIds.length > 0) onStartChat(paperIds);
  };

  return (
    <div className="search-view">
      {!searched && (
        <div className="search-hero">
          <h2 className="search-hero-title">
            <IconBrain size={28} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 8 }} />
            ResearchMind VN
          </h2>
          <p className="search-hero-desc">
            Tìm kiếm ngữ nghĩa trong toàn bộ thư viện PDF của bạn
          </p>
        </div>
      )}

      <div className="search-bar-container" style={{ position: "relative" }}>
        <div className="search-bar-outer">
          <div className="search-bar">
            <input
              type="text"
              className="search-input"
              placeholder='Ví dụ: "phương pháp đánh giá độ trễ mạng 5G"'
              value={query}
              onChange={(e) => {
                handleQueryChange(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={handleKeyDown}
            />
            <button className="search-btn" onClick={handleSearch} disabled={searching}>
              {searching ? <IconSpinner size={18} /> : <IconSearch size={18} />}
            </button>
          </div>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="search-suggest-dropdown">
            {suggestions.map((s, idx) => {
              const isTag = s.startsWith("Thẻ: ");
              const displayText = isTag ? s.substring(5) : s;
              return (
                <div
                  key={idx}
                  className="search-suggest-item"
                  onClick={() => handleSuggestionClick(displayText, isTag)}
                >
                  {isTag ? (
                    <IconBookmark size={14} style={{ color: "var(--color-primary)" }} />
                  ) : (
                    <IconFileText size={14} style={{ color: "var(--color-text-muted)" }} />
                  )}
                  <span className={`search-suggest-item-text ${isTag ? "search-suggest-item-tag" : ""}`}>
                    {displayText}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="search-filter-bar">
        <div className="filter-pill filter-pill-dropdown">
          <IconFolder size={14} className="filter-pill-icon" />
          <select
            className="filter-pill-select"
            value={filters.collection_id || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, collection_id: e.target.value || undefined }))}
            title="Collection"
          >
            <option value="">Toàn thư viện</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>{collection.name}</option>
            ))}
          </select>
          <IconChevronDown size={11} className="filter-pill-arrow" />
        </div>

        <div className="filter-pill">
          <IconUser size={14} className="filter-pill-icon" />
          <input
            className="filter-pill-input"
            value={filters.author || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, author: e.target.value }))}
            placeholder="Tác giả"
          />
        </div>

        <div className="filter-pill">
          <IconCalendar size={14} className="filter-pill-icon" />
          <input
            className="filter-pill-input compact"
            type="number"
            value={filters.year_from || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, year_from: e.target.value ? Number(e.target.value) : null }))}
            placeholder="Từ năm"
          />
        </div>

        <div className="filter-pill">
          <IconCalendar size={14} className="filter-pill-icon" />
          <input
            className="filter-pill-input compact"
            type="number"
            value={filters.year_to || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, year_to: e.target.value ? Number(e.target.value) : null }))}
            placeholder="Đến năm"
          />
        </div>

        <div className="filter-pill">
          <IconBookmark size={14} className="filter-pill-icon" />
          <input
            className="filter-pill-input"
            value={(filters.tags || []).join(", ")}
            onChange={(e) => setFilters((prev) => ({ ...prev, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) }))}
            placeholder="Thẻ (tags)"
          />
        </div>

        <div className="filter-pill filter-pill-dropdown">
          <IconBookOpen size={14} className="filter-pill-icon" />
          <select
            className="filter-pill-select"
            value={filters.read_status || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, read_status: e.target.value || undefined }))}
            title="Trạng thái đọc"
          >
            <option value="">Trạng thái đọc</option>
            <option value="unread">Chưa đọc</option>
            <option value="reading">Đang đọc</option>
            <option value="read">Đã đọc</option>
          </select>
          <IconChevronDown size={11} className="filter-pill-arrow" />
        </div>

        <div className="filter-pill filter-pill-dropdown">
          <IconStar size={14} className="filter-pill-icon" />
          <select
            className="filter-pill-select"
            value={filters.starred === true ? "true" : filters.starred === false ? "false" : ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, starred: e.target.value === "" ? null : e.target.value === "true" }))}
            title="Yêu thích"
          >
            <option value="">Yêu thích</option>
            <option value="true">Đã thích</option>
            <option value="false">Không star</option>
          </select>
          <IconChevronDown size={11} className="filter-pill-arrow" />
        </div>

        <div className="filter-pill filter-pill-dropdown">
          <IconChart size={14} className="filter-pill-icon" />
          <select
            className="filter-pill-select"
            value={filters.sort_by || "relevance"}
            onChange={(e) => setFilters((prev) => ({ ...prev, sort_by: e.target.value }))}
            title="Sắp xếp"
          >
            <option value="relevance">Sắp xếp: Relevance</option>
            <option value="year">Year</option>
            <option value="title">Title</option>
            <option value="created_at">Imported</option>
          </select>
          <IconChevronDown size={11} className="filter-pill-arrow" />
        </div>

        <button 
          className="search-filter-btn" 
          onClick={saveCurrentSearch}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <IconBookmark size={13} />
          <span>Lưu search</span>
        </button>
      </div>

      {savedSearches.length > 0 && (
        <div className="saved-search-row">
          {savedSearches.slice(0, 6).map((saved) => (
            <button key={saved.id} className="saved-search-chip" onClick={() => applySavedSearch(saved)}>
              {saved.name}
            </button>
          ))}
        </div>
      )}

      <div className="search-results">
        {searching && results.length === 0 && (
          <div className="search-loading">
            <IconSpinner size={24} />
            <span>Đang tìm kiếm...</span>
          </div>
        )}

        {!searching && searched && results.length === 0 && (
          <div className="search-empty">
            <IconBrain size={48} className="icon-gradient" />
            <h3>Không tìm thấy kết quả</h3>
            <p>Thử với từ khóa khác hoặc import thêm PDF.</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="search-results-header">
              <span className="search-results-count" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <IconSearch size={14} style={{ color: "var(--color-primary)" }} />
                <span>Tìm thấy {results.length} đoạn trích</span>
              </span>
              {embeddingInfo && (
                <span className="embedding-badge" title={`Pooling: ${embeddingInfo.pooling.toUpperCase()}, Normalize: ${embeddingInfo.normalize}`}>
                  {embeddingInfo.mode === "cloud" ? "Cloud Mode" : "Local Model"} ({embeddingInfo.pooling.toUpperCase()})
                </span>
              )}
              <button className="search-chat-btn" onClick={chatWithResults}>
                <IconChat size={14} />
                <span>Chat với kết quả này</span>
              </button>
            </div>

            <div className="search-results-list">
              {(clustered.length > 0 ? clustered : []).map((cluster) => {
                const isExpanded = expandedPapers.has(cluster.paper_id);
                return (
                  <div key={cluster.paper_id} className="search-paper-cluster">
                    <div
                      className="search-paper-header"
                      onClick={() => {
                        const next = new Set(expandedPapers);
                        if (isExpanded) next.delete(cluster.paper_id);
                        else next.add(cluster.paper_id);
                        setExpandedPapers(next);
                      }}
                    >
                      <span className="search-paper-toggle">{isExpanded ? "▼" : "▶"}</span>
                      <IconFileText size={16} style={{ marginRight: 6 }} />
                      <span className="search-paper-title">
                        {cluster.paper_title
                          .replace(/^[0-9a-f-]{36}_/, '')
                          .replace(/\+/g, ' ')
                          .replace(/%[0-9a-fA-F]{2}/g, '')
                          || "Không có tiêu đề"}
                      </span>
                      <span className="search-paper-count">{cluster.chunks.length} đoạn</span>
                      <span className="search-paper-best-score" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <IconStar size={12} className="starred" style={{ color: "var(--color-warning, #eab308)" }} />
                        <span>{Math.max(...cluster.chunks.map(c => Math.abs(c.score))).toFixed(2)}</span>
                      </span>
                    </div>
                    {isExpanded && cluster.chunks.map((r) => (
                      <div key={r.chunk_id} className="search-result-card" style={{ marginLeft: 24 }}>
                        <div className="search-result-content">
                          <div className="search-result-header">
                            <span className="search-result-page-label">
                              {r.page_number ? `Trang ${r.page_number}` : ""}
                            </span>
                            <span className="search-result-score" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <IconStar size={12} className="starred" style={{ color: "var(--color-warning, #eab308)" }} />
                              <span>{Math.abs(r.score).toFixed(2)}</span>
                            </span>
                          </div>
                          <p className="search-result-text">{r.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {clustered.length === 0 && results.slice(0, visibleResultCount || results.length).map((r, i) => (
                <div key={r.chunk_id} className="search-result-card">
                  <div className="search-result-num">{i + 1}</div>
                  <div className="search-result-content">
                    <div className="search-result-header">
                      <span className="search-result-title">
                        <IconFileText size={16} style={{ marginRight: 4 }} />
                        {r.paper_title
                          .replace(/^[0-9a-f-]{36}_/, '')
                          .replace(/\+/g, ' ')
                          .replace(/%[0-9a-fA-F]{2}/g, '')
                          || "Không có tiêu đề"}
                      </span>
                      <span className="search-result-score" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <IconStar size={12} className="starred" style={{ color: "var(--color-warning, #eab308)" }} />
                        <span>{Math.abs(r.score).toFixed(2)}</span>
                      </span>
                    </div>
                    {r.page_number && (
                      <span className="search-result-page">Trang {r.page_number}</span>
                    )}
                    <p className="search-result-text">{r.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!searched && (
          <div className="search-suggestions-container">
            <div className="search-suggestions-header">
              <IconBulb size={18} className="icon-gradient" />
              <span>Gợi ý cho bạn</span>
            </div>
            <div className="search-suggestions-grid">
              {SUGGESTED_QUERIES.map((s, i) => (
                <button
                  key={i}
                  className="search-suggestion-card"
                  onClick={() => handleSuggestionClick(s.text)}
                >
                  <span className="search-suggestion-icon">{s.icon}</span>
                  <span className="search-suggestion-text">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
