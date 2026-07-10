import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  IconSparkle,
  IconClose,
  IconCloud,
  IconLaptop,
  IconWithText,
  IconSettings,
} from "../Icons";

const SUGGESTED_QUERIES = [
  { icon: <IconBrain size={18} />, key: "suggest_main_ideas" },
  { icon: <IconChart size={18} />, key: "suggest_compare_methods" },
  { icon: <IconSearch size={18} />, key: "suggest_transformer" },
  { icon: <IconBulb size={18} />, key: "suggest_recent_trends" },
  { icon: <IconFileText size={18} />, key: "suggest_key_contributions" },
  { icon: <IconZap size={18} />, key: "suggest_strengths_weaknesses" },
];

const searchSessionCache = new Map<string, SearchResult[]>();
const makeSearchCacheKey = (query: string, filters: SearchFilters) =>
  JSON.stringify({ query: query.trim().toLowerCase(), filters });

export const SearchView: React.FC<{ onStartChat: (paperIds: string[]) => void }> = ({ onStartChat }) => {
  const { t } = useTranslation();
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
  const [showFilters, setShowFilters] = useState(false);
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
    const queryVal = isTag ? `${t("search.tag_prefix")}:"${text}"` : text;
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
    const name = prompt(t("search.save_search_prompt"), query.slice(0, 40));
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

  const clearFilters = () => {
    setFilters({
      sort_by: "relevance",
      sort_order: "desc",
      starred: null,
    });
  };

  const hasActiveFilters = () => {
    return !!(filters.collection_id || filters.author || filters.year_from || filters.year_to || 
              (filters.tags && filters.tags.length > 0) || filters.read_status || filters.starred !== null);
  };

  return (
    <div className="search-view-modern">
      {/* Hero Section - AI Style */}
      {!searched && (
        <div className="search-hero-modern">
          <div className="search-hero-glow" />
          <div className="search-hero-content">
            <div className="search-hero-badge">
              <IconSparkle size={14} />
              <span>{t("search.hero_badge")}</span>
            </div>
            <h1 className="search-hero-title">
              <IconBrain size={32} className="icon-gradient" />
              <span>{t("search.hero_title")}</span>
            </h1>
            <p className="search-hero-desc">
              {t("search.hero_desc")}
            </p>
            <div className="search-hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-value">{collections.length}</span>
                <span className="hero-stat-label">{t("search.stat_saved")}</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value">{savedSearches.length}</span>
                <span className="hero-stat-label">{t("search.stat_saved")}</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value hero-stat-value--icon">
                  {embeddingInfo?.mode === "cloud" ? <IconCloud size={22} /> : <IconLaptop size={22} />}
                </span>
                <span className="hero-stat-label">
                  {embeddingInfo?.mode === "cloud" ? t("search.stat_cloud") : t("search.stat_local")}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar - Modern */}
      <div className="search-bar-modern">
        <div className="search-bar-wrapper">
          <div className="search-bar-input-wrapper">
            <IconSearch className="search-bar-icon" size={20} />
            <input
              type="text"
              className="search-bar-input"
              placeholder={t("search.placeholder")}
              value={query}
              onChange={(e) => {
                handleQueryChange(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <button 
                className="search-bar-clear"
                onClick={() => {
                  setQuery("");
                  setSuggestions([]);
                }}
              >
                <IconClose size={16} />
              </button>
            )}
            <button 
              className="search-bar-submit" 
              onClick={handleSearch} 
              disabled={searching}
            >
              {searching ? <IconSpinner size={18} /> : t("search.search_btn")}
            </button>
          </div>
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="search-suggest-dropdown-modern">
            <div className="suggest-header">
              <IconBulb size={14} />
              <span>{t("search.suggestions")}</span>
            </div>
            {suggestions.map((s, idx) => {
              const isTag = s.startsWith(`${t("search.tag_prefix")}: `);
              const displayText = isTag ? s.substring(t("search.tag_prefix").length + 2) : s;
              return (
                <div
                  key={idx}
                  className="search-suggest-item-modern"
                  onClick={() => handleSuggestionClick(displayText, isTag)}
                >
                  {isTag ? (
                    <IconBookmark size={14} className="suggest-icon-tag" />
                  ) : (
                    <IconFileText size={14} className="suggest-icon-file" />
                  )}
                  <span className="suggest-text">{displayText}</span>
                  <span className="suggest-action">{"\u2192"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter Bar - Toggle */}
      <div className="search-filter-bar-modern">
        <div className="filter-bar-left">
          <button 
            className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <IconSettings size={16} />
            <span>{t("search.filters_toggle")}</span>
            {hasActiveFilters() && <span className="filter-dot" />}
          </button>
          
          {savedSearches.length > 0 && (
            <div className="saved-search-scroll">
              {savedSearches.slice(0, 4).map((saved) => (
                <button key={saved.id} className="saved-search-chip-modern" onClick={() => applySavedSearch(saved)}>
                  <IconBookmark size={12} />
                  {saved.name}
                </button>
              ))}
              {savedSearches.length > 4 && (
                <button className="saved-search-chip-more">+{savedSearches.length - 4}</button>
              )}
            </div>
          )}
        </div>

        <button 
          className="search-save-btn" 
          onClick={saveCurrentSearch}
          disabled={!query.trim()}
        >
          <IconBookmark size={14} />
          <span>{t("search.save_search")}</span>
        </button>
      </div>

      {/* Filter Panel - Expandable */}
      {showFilters && (
        <div className="filter-panel-modern">
          <div className="filter-panel-header">
            <span className="filter-panel-title">{t("search.filters_panel")}</span>
            <button className="filter-clear-btn" onClick={clearFilters}>
              {t("search.clear_all")}
            </button>
          </div>
          <div className="filter-panel-grid">
            <div className="filter-group">
              <label><IconFolder size={14} /> {t("search.filter_collection")}</label>
              <select
                className="filter-select"
                value={filters.collection_id || ""}
                onChange={(e) => setFilters((prev) => ({ ...prev, collection_id: e.target.value || undefined }))}
              >
                <option value="">{t("search.all_library")}</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>{collection.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label><IconUser size={14} /> {t("search.filter_author")}</label>
              <input
                className="filter-input"
                value={filters.author || ""}
                onChange={(e) => setFilters((prev) => ({ ...prev, author: e.target.value }))}
                placeholder={t("search.author_placeholder")}
              />
            </div>

            <div className="filter-group">
              <label><IconCalendar size={14} /> {t("search.filter_year")}</label>
              <div className="filter-year-group">
                <input
                  className="filter-input compact"
                  type="number"
                  value={filters.year_from || ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, year_from: e.target.value ? Number(e.target.value) : null }))}
                  placeholder={t("search.year_from")}
                />
                <span className="filter-year-sep">-</span>
                <input
                  className="filter-input compact"
                  type="number"
                  value={filters.year_to || ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, year_to: e.target.value ? Number(e.target.value) : null }))}
                  placeholder={t("search.year_to")}
                />
              </div>
            </div>

            <div className="filter-group">
              <label><IconBookmark size={14} /> {t("search.filter_tags")}</label>
              <input
                className="filter-input"
                value={(filters.tags || []).join(", ")}
                onChange={(e) => setFilters((prev) => ({ ...prev, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) }))}
                placeholder={t("search.tags_placeholder")}
              />
            </div>

            <div className="filter-group">
              <label><IconBookOpen size={14} /> {t("search.filter_read_status")}</label>
              <select
                className="filter-select"
                value={filters.read_status || ""}
                onChange={(e) => setFilters((prev) => ({ ...prev, read_status: e.target.value || undefined }))}
              >
                <option value="">{t("search.all_status")}</option>
                <option value="unread">{t("search.status_unread")}</option>
                <option value="reading">{t("search.status_reading")}</option>
                <option value="read">{t("search.status_read")}</option>
              </select>
            </div>

            <div className="filter-group">
              <label><IconStar size={14} /> {t("search.filter_favorite")}</label>
              <select
                className="filter-select"
                value={filters.starred === true ? "true" : filters.starred === false ? "false" : ""}
                onChange={(e) => setFilters((prev) => ({ ...prev, starred: e.target.value === "" ? null : e.target.value === "true" }))}
              >
                <option value="">{t("search.all_status")}</option>
                <option value="true">{t("search.option_marked")}</option>
                <option value="false">{t("search.option_unmarked")}</option>
              </select>
            </div>

            <div className="filter-group">
              <label><IconChart size={14} /> {t("search.sort")}</label>
              <select
                className="filter-select"
                value={filters.sort_by || "relevance"}
                onChange={(e) => setFilters((prev) => ({ ...prev, sort_by: e.target.value }))}
              >
                <option value="relevance">{t("search.sort_relevance")}</option>
                <option value="year">{t("search.sort_year")}</option>
                <option value="title">{t("search.sort_title")}</option>
                <option value="created_at">{t("search.sort_date")}</option>
              </select>
            </div>
          </div>
          <div className="filter-panel-actions">
            <button className="filter-apply-btn" onClick={() => performSearch(query)}>
              {t("search.apply_filters")}
            </button>
          </div>
        </div>
      )}

      {/* Search Results */}
      <div className="search-results-modern">
        {searching && results.length === 0 && (
          <div className="search-loading-modern">
            <div className="search-loading-spinner">
              <IconSpinner size={32} />
            </div>
            <p>{t("search.loading")}</p>
          </div>
        )}

        {!searching && searched && results.length === 0 && (
          <div className="search-empty-modern">
            <div className="search-empty-icon">
              <IconBrain size={56} className="icon-gradient" />
            </div>
            <h3>{t("search.no_results_title")}</h3>
            <p>{t("search.no_results_desc")}</p>
            <div className="search-empty-tips">
              <IconWithText icon={IconBulb} size={14}>{t("search.tips_label")}</IconWithText>
              <ul>
                <li>{t("search.tip_specific")}</li>
                <li>{t("search.tip_spelling")}</li>
                <li>{t("search.tip_english")}</li>
              </ul>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="search-results-header-modern">
              <div className="results-header-left">
                <IconSearch size={16} className="results-icon" />
                <span className="results-count">
                  {t("search.results_found", { count: results.length })}</span>
                {embeddingInfo && (
                  <span className="embedding-badge-modern">
                    <IconSparkle size={12} />
                    {embeddingInfo.mode === "cloud" ? t("search.embedding_cloud") : t("search.embedding_local")}
                  </span>
                )}
              </div>
              <button className="chat-with-results-btn" onClick={chatWithResults}>
                <IconChat size={16} />
                <span>{t("search.chat_with_results")}</span>
              </button>
            </div>

            <div className="search-results-list-modern">
              {(clustered.length > 0 ? clustered : []).map((cluster) => {
                const isExpanded = expandedPapers.has(cluster.paper_id);
                return (
                  <div key={cluster.paper_id} className="search-paper-cluster-modern">
                    <div
                      className="search-paper-header-modern"
                      onClick={() => {
                        const next = new Set(expandedPapers);
                        if (isExpanded) next.delete(cluster.paper_id);
                        else next.add(cluster.paper_id);
                        setExpandedPapers(next);
                      }}
                    >
                      <span className="search-paper-toggle">{isExpanded ? "\u25bc" : "\u25b6"}</span>
                      <IconFileText size={16} className="paper-icon" />
                      <span className="search-paper-title-modern">
                        {cluster.paper_title
                          .replace(/^[0-9a-f-]{36}_/, '')
                          .replace(/\+/g, ' ')
                          .replace(/%[0-9a-fA-F]{2}/g, '')
                          || t("search.no_title")}
                      </span>
                      <span className="search-paper-badge">{t("search.chunks_count", { count: cluster.chunks.length })}</span>
                      <span className="search-paper-score">
                        <IconStar size={12} />
                        {Math.max(...cluster.chunks.map(c => Math.abs(c.score))).toFixed(2)}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="search-paper-chunks">
                        {cluster.chunks.map((r) => (
                          <div key={r.chunk_id} className="search-result-card-modern">
                            <div className="result-card-header">
                              {r.page_number && (
                                <span className="result-page-badge">
                                  <IconBookOpen size={12} />
                                  {t("search.page_label", { n: r.page_number })}
                                </span>
                              )}
                              <span className="result-score-badge">
                                <IconStar size={12} />
                                {Math.abs(r.score).toFixed(2)}
                              </span>
                            </div>
                            <p className="result-card-text">{r.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {clustered.length === 0 && results.slice(0, visibleResultCount || results.length).map((r, i) => (
                <div key={r.chunk_id} className="search-result-card-modern">
                  <div className="result-card-index">{i + 1}</div>
                  <div className="result-card-body">
                    <div className="result-card-title">
                      <IconFileText size={16} />
                      <span>
                        {r.paper_title
                          .replace(/^[0-9a-f-]{36}_/, '')
                          .replace(/\+/g, ' ')
                          .replace(/%[0-9a-fA-F]{2}/g, '')
                          || t("search.no_title")}
                      </span>
                    </div>
                    <div className="result-card-meta">
                      {r.page_number && (
                        <span className="result-page">
                          <IconBookOpen size={12} />
                          {t("search.page_label", { n: r.page_number })}
                        </span>
                      )}
                      <span className="result-score">
                        <IconStar size={12} />
                        {Math.abs(r.score).toFixed(2)}
                      </span>
                    </div>
                    <p className="result-card-text">{r.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!searched && (
          <div className="search-suggestions-modern">
            <div className="suggestions-header">
              <IconBulb size={20} className="suggestions-icon" />
              <span>{t("search.smart_suggestions")}</span>
            </div>
            <div className="suggestions-grid">
              {SUGGESTED_QUERIES.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-card-modern"
                  onClick={() => handleSuggestionClick(t(`search.${s.key}`))}
                >
                  <span className="suggestion-card-icon">{s.icon}</span>
                  <span className="suggestion-card-text">{t(`search.${s.key}`)}</span>
                  <span className="suggestion-card-arrow">{"\u2192"}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};