import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { api, Paper, Highlight, ChatResponse, getAuthenticatedApiUrl } from "../../lib/api";
import { paperDisplayAuthors, paperDisplayTitle } from "../../lib/paperDisplay";
import { useToast } from "../shared/Toast";
import { HighlightListSkeleton } from "../shared/Skeleton";
import { MarkdownRenderer } from "../chat/MarkdownRenderer";
import {
  IconSearch,
  IconSpinner,
  IconFileText,
  IconCopy,
  IconChat,
  IconSparkle,
  IconCheck,
  IconBookOpen,
  IconBrain,
  IconBulb,
  IconBookmark,
  IconSettings,
  IconError,
} from "../Icons";

const CATEGORY_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  key_finding: { bg: "rgba(16, 185, 129, 0.08)", color: "#34d399", border: "rgba(16, 185, 129, 0.2)" },
  methodology: { bg: "rgba(var(--color-primary-rgb), 0.08)", color: "#818cf8", border: "rgba(var(--color-primary-rgb), 0.2)" },
  conclusion: { bg: "rgba(168, 85, 247, 0.08)", color: "#c084fc", border: "rgba(168, 85, 247, 0.2)" },
  novel_contribution: { bg: "rgba(236, 72, 153, 0.08)", color: "#f472b6", border: "rgba(236, 72, 153, 0.2)" },
  limitation: { bg: "rgba(239, 68, 68, 0.08)", color: "#f87171", border: "rgba(239, 68, 68, 0.2)" },
  important_claim: { bg: "var(--color-surface-hover)", color: "var(--color-text-secondary)", border: "var(--color-border)" },
};

function renderStars(importance: string): string {
  return importance === "high" ? "★★★★★" : "★★★☆☆";
}

const getCategoryIcon = (category: string, size = 12) => {
  if (category === "key_finding") return <IconSparkle size={size} style={{ color: "#34d399" }} />;
  if (category === "methodology") return <IconSettings size={size} style={{ color: "#818cf8" }} />;
  if (category === "conclusion") return <IconCheck size={size} style={{ color: "#c084fc" }} />;
  if (category === "novel_contribution") return <IconBulb size={size} style={{ color: "#f472b6" }} />;
  if (category === "limitation") return <IconError size={size} style={{ color: "#f87171" }} />;
  return <IconBookmark size={size} />;
};

function getPdfPageUrl(paperId: string, pageNumber: number | null): string {
  const base = getAuthenticatedApiUrl(`/api/papers/${paperId}/file`);
  if (pageNumber) {
    return `${base}#page=${pageNumber}`;
  }
  return base;
}

const getCategories = (t: (key: string) => string) => [
  { value: "all", label: t("highlights.filter_all") },
  { value: "key_finding", label: t("highlights.filter_results") },
  { value: "methodology", label: t("highlights.filter_methods") },
  { value: "conclusion", label: t("highlights.filter_conclusions") },
  { value: "novel_contribution", label: t("highlights.filter_contributions") },
  { value: "limitation", label: t("highlights.filter_limitations") },
  { value: "important_claim", label: t("highlights.filter_key_points") },
];

const getCategoryLabels = (t: (key: string) => string): Record<string, string> => ({
  key_finding: t("highlights.category_results"),
  methodology: t("highlights.category_methods"),
  conclusion: t("highlights.category_conclusions"),
  novel_contribution: t("highlights.category_contributions"),
  limitation: t("highlights.category_limitations"),
  important_claim: t("highlights.category_key_points"),
});

const getGenerateOptions = (t: (key: string) => string) => [
  { id: "summary", label: t("highlights.gen_summary"), desc: t("highlights.gen_summary_desc") },
  { id: "compare", label: t("highlights.gen_compare"), desc: t("highlights.gen_compare_desc") },
  { id: "debate", label: t("highlights.gen_debate"), desc: t("highlights.gen_debate_desc") },
  { id: "gap", label: t("highlights.gen_gap"), desc: t("highlights.gen_gap_desc") },
  { id: "litreview", label: t("highlights.gen_review"), desc: t("highlights.gen_review_desc") },
] as const;

export const HighlightsLibraryView: React.FC<{
  onStartChat: (paperIds: string[]) => void;
}> = ({ onStartChat }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const CATEGORY_LABELS = getCategoryLabels(t);
  const GENERATE_OPTIONS = getGenerateOptions(t);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [searchPaperQuery, setSearchPaperQuery] = useState("");
  const [highlightQuery, setHighlightQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const toast = useToast();

  // Context toggle: track which highlight IDs (stable hash) are included in chat context
  const [contextIncluded, setContextIncluded] = useState<Set<string>>(new Set());

  // PDF overlay state
  const [showPdfOverlay, setShowPdfOverlay] = useState(false);
  const [pdfOverlayUrl, setPdfOverlayUrl] = useState<string | null>(null);

  // Close PDF overlay on Escape
  useEffect(() => {
    if (!showPdfOverlay) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPdfOverlay(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showPdfOverlay]);

  // Generate section state
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [generateResults, setGenerateResults] = useState<{ type: string; result: ChatResponse }[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // AI Insights card state
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [paperDetail, setPaperDetail] = useState<Paper & { chunk_count?: number } | null>(null);
  const [loadingPaperDetail, setLoadingPaperDetail] = useState(false);
  const [regeneratingSummary, setRegeneratingSummary] = useState(false);
  const resultsAnchorRef = React.useRef<HTMLDivElement | null>(null);

  // Generate a stable ID for a highlight (independent of array index)
  const getHighlightId = useCallback((h: Highlight): string => {
    return `${h.category}::${h.text.slice(0, 60)}::${h.page_hint || "0"}`;
  }, []);

  useEffect(() => {
    loadPapers();
  }, []);

  useEffect(() => {
    if (selectedPaper) {
      loadHighlights(selectedPaper.id);
      loadPaperDetail(selectedPaper.id);
      setContextIncluded(new Set());
    } else {
      setHighlights([]);
      setPaperDetail(null);
      setGenerateResults([]);
      setGenerateError(null);
    }
  }, [selectedPaper?.id]);

  // Auto-regenerate summary when language changes and summary language mismatches
  useEffect(() => {
    if (!paperDetail?.auto_summary) return;
    if (regeneratingSummary) return;
    if (!selectedPaper) return;
    const currentLang = (i18n.language || "vi").split("-")[0];
    const summaryLang = paperDetail.auto_summary_lang || "vi";
    if (currentLang === summaryLang) return;
    setRegeneratingSummary(true);
    api.regenerateSummary(selectedPaper.id).then((res) => {
      setPaperDetail((prev) => prev ? { ...prev, auto_summary: res.auto_summary, auto_summary_lang: res.auto_summary_lang } : prev);
    }).catch((e) => {
      console.error("Failed to regenerate summary:", e);
    }).finally(() => {
      setRegeneratingSummary(false);
    });
  }, [selectedPaper?.id, paperDetail?.auto_summary_lang, i18n.language]);

  const loadPapers = async () => {
    setLoadingPapers(true);
    try {
      const res = await api.listPapers(1, 1000, "indexed");
      setPapers(res.papers);
      if (res.papers.length > 0) {
        setSelectedPaper(res.papers[0]);
      }
    } catch (e) {
      console.error("Failed to load papers:", e);
    } finally {
      setLoadingPapers(false);
    }
  };

  const loadHighlights = async (paperId: string) => {
    setLoadingHighlights(true);
    try {
      const res = await api.findHighlights(paperId, 15);
      setHighlights(res.highlights || []);
    } catch (e) {
      console.error("Failed to load highlights:", e);
      setHighlights([]);
    } finally {
      setLoadingHighlights(false);
    }
  };

  const handleCopyHighlight = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.addToast("success", t("highlights.toast_copied"));
  };

  const handleChatWithHighlight = () => {
    if (!selectedPaper) return;
    onStartChat([selectedPaper.id]);
  };

  const handleOpenPdfPage = (pageNumber: number | null) => {
    if (!selectedPaper) return;
    const url = getPdfPageUrl(selectedPaper.id, pageNumber);
    setPdfOverlayUrl(url);
    setShowPdfOverlay(true);
  };

  const toggleContext = (id: string) => {
    setContextIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const loadPaperDetail = async (paperId: string) => {
    setLoadingPaperDetail(true);
    try {
      const res = await api.getPaper(paperId);
      setPaperDetail(res);
    } catch (e) {
      console.error("Failed to load paper detail:", e);
    } finally {
      setLoadingPaperDetail(false);
    }
  };

  const handleChatWithSelected = () => {
    if (!selectedPaper || contextIncluded.size === 0) return;
    onStartChat([selectedPaper.id]);
  };

  // ─── Generate handlers ────────────────────────────────────
  const handleGenerateOne = async (optId: string) => {
    if (!selectedPaper || generatingType) return;
    setGeneratingType(optId);
    setGenerateError(null);
    try {
      let res: ChatResponse;
      switch (optId) {
        case "summary":
          res = await api.review(t("highlights.prompt_detailed_summary"), [selectedPaper.id]);
          break;
        case "compare":
          res = await api.comparePapers([selectedPaper.id]);
          break;
        case "debate":
          res = await api.debate(t("highlights.prompt_debate"), [selectedPaper.id]);
          break;
        case "gap":
          res = await api.findResearchGap([selectedPaper.id]);
          break;
        case "litreview":
          res = await api.review(t("highlights.prompt_lit_review"), [selectedPaper.id]);
          break;
        default:
          return;
      }
      setGenerateResults((prev) => {
        const filtered = prev.filter((r) => r.type !== optId);
        return [...filtered, { type: optId, result: res }];
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setGenerateError(`Error: ${msg}`);
      console.error(`Generate failed for ${optId}:`, e);
    } finally {
      setGeneratingType(null);
    }
  };

  // Compute insights stats from highlights
  const insightsStats = useMemo(() => {
    const counts: Record<string, number> = {};
    let highCount = 0;
    let totalImportance = 0;
    highlights.forEach((h) => {
      counts[h.category] = (counts[h.category] || 0) + 1;
      if (h.importance === "high") highCount++;
      totalImportance++;
    });
    return {
      counts,
      total: highlights.length,
      highCount,
      importantRatio: totalImportance > 0 ? Math.round((highCount / totalImportance) * 100) : 0,
    };
  }, [highlights]);

  // Parse tags from paper
  const parsedTags = useMemo(() => {
    if (!selectedPaper?.tags) return [];
    try {
      return JSON.parse(selectedPaper.tags) as string[];
    } catch {
      return [];
    }
  }, [selectedPaper?.tags]);

  const filteredPapers = papers.filter((p) =>
    paperDisplayTitle(p.title, p.filename).toLowerCase().includes(searchPaperQuery.toLowerCase())
  );

  const filteredHighlights = highlights.filter((h) => {
    const matchesSearch =
      h.text.toLowerCase().includes(highlightQuery.toLowerCase()) ||
      h.note.toLowerCase().includes(highlightQuery.toLowerCase());
    const matchesCategory =
      activeTab === "all" || h.category === activeTab;
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    if (!selectedPaper) return;
    if (loadingHighlights) return;
    if (activeTab === "all") return;
    if (typeof window === "undefined") return;

    const id = window.requestAnimationFrame(() => {
      resultsAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(id);
  }, [activeTab, selectedPaper?.id, loadingHighlights]);

  // ─── Helper: render auto_summary markdown ────────────────
  const renderSummary = (text: string) => {
    const lines = text.split('\n');
    const summaryLines = summaryExpanded ? lines : lines.slice(0, 6);
    const isLong = lines.length > 6;
    return (
      <>
        {summaryLines.map((line, i) => {
          if (line.startsWith('###')) {
            return <h5 key={i} className="hl-insight-summary-heading">{line.replace(/^#+\s*/, '')}</h5>;
          }
          const itemMatch = line.match(/^\s*[-*]\s*\*\*(.+?)\*\*:?\s*(.*)$/);
          if (itemMatch) {
            const label = itemMatch[1].trim();
            const value = itemMatch[2].trim();
            return (
              <div key={i} className="hl-insight-summary-item">
                <span className="hl-insight-summary-label">{label}:</span>
                <span className="hl-insight-summary-value">{value}</span>
              </div>
            );
          }
          if (line.trim()) return <p key={i} className="hl-insight-summary-text">{line}</p>;
          return null;
        })}
        {isLong && (
          <button
            className="hl-insight-summary-toggle"
            onClick={() => setSummaryExpanded(!summaryExpanded)}
          >
            {summaryExpanded ? t("highlights.collapse") : t("highlights.expand")}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="hl-view">
      {/* Left sidebar: Paper list */}
      <div className="hl-sidebar">
        <div className="hl-sidebar-header">
          <h3 className="hl-sidebar-title">
            <IconFileText size={16} />
            <span>{t("highlights.select_doc")}</span>
          </h3>
          <div className="hl-sidebar-search">
            <IconSearch size={14} className="hl-sidebar-search-icon" />
            <input
              type="text"
              placeholder={t("highlights.search_doc")}
              value={searchPaperQuery}
              onChange={(e) => setSearchPaperQuery(e.target.value)}
              className="hl-sidebar-search-input"
            />
          </div>
        </div>

        <div className="hl-sidebar-list">
          {loadingPapers ? (
            <div className="hl-sidebar-loading">
              <IconSpinner size={18} />
              <span>{t("highlights.loading")}</span>
            </div>
          ) : filteredPapers.length === 0 ? (
            <div className="hl-sidebar-empty">
              {t("highlights.no_match")}
            </div>
          ) : (
            filteredPapers.map((p) => {
              const isActive = selectedPaper?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPaper(p)}
                  className={`hl-paper-item ${isActive ? "active" : ""}`}
                >
                  <div className="hl-paper-item-title" title={paperDisplayTitle(p.title, p.filename)}>
                    {paperDisplayTitle(p.title, p.filename)}
                  </div>
                  <div className="hl-paper-item-meta">
                    {p.authors && p.authors !== "[]"
                      ? p.authors.replace(/[\[\]"']/g, "")
                      : t("highlights.unknown_author")}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Center: Evidence Panel */}
      <div className="hl-content">
        {selectedPaper ? (
          <>
            {/* Paper header */}
            <div className="hl-content-header">
              <div className="hl-content-header-info">
                <span className="hl-content-header-badge">{t("highlights.badge")}</span>
                <h2 className="hl-content-header-title">
                  {paperDisplayTitle(selectedPaper.title, selectedPaper.filename)}
                </h2>
                <p className="hl-content-header-meta">
                  {t("highlights.author_fallback")}: {(() => {
                    const authors = paperDisplayAuthors(selectedPaper.authors);
                    return authors.length > 0 ? authors.join(", ") : t("highlights.author_fallback");
                  })()}{" "}
                  • {t("highlights.year", { year: selectedPaper.year || "N/A" })}
                </p>
              </div>
              <div className="hl-content-header-actions">
                {contextIncluded.size > 0 && (
                  <button
                    className="hl-chat-selected-btn"
                    onClick={handleChatWithSelected}
                    title={t("highlights.ask_ai_selected", { n: contextIncluded.size })}
                  >
                    <IconChat size={14} />
                    <span>{t("highlights.ask_ai_btn", { n: contextIncluded.size })}</span>
                  </button>
                )}
                <button
                  className="hl-refresh-btn"
                  onClick={() => selectedPaper && loadHighlights(selectedPaper.id)}
                  title={t("highlights.reanalyze_title")}
                >
                  <IconSparkle size={14} />
                  <span>{t("highlights.reanalyze_title")}</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="hl-tabs">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  className={`hl-tab ${activeTab === cat.value ? "active" : ""}`}
                  onClick={() => setActiveTab(cat.value)}
                >
                <span className="hl-tab-label">{cat.label}</span>
                    <span className="hl-tab-count">
                      {cat.value === "all"
                        ? highlights.length
                        : highlights.filter((h) => h.category === cat.value).length}
                    </span>
                </button>
              ))}
            </div>

            {/* Search bar */}
            <div className="hl-search-bar">
              <IconSearch size={14} className="hl-search-bar-icon" />
              <input
                type="text"
                placeholder={t("highlights.search_placeholder")}
                value={highlightQuery}
                onChange={(e) => setHighlightQuery(e.target.value)}
                className="hl-search-bar-input"
              />
              {highlightQuery && (
                <button
                    type="button"
                  className="hl-search-bar-clear"
                  onClick={() => setHighlightQuery("")}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Evidence Cards Feed */}
            <div className="hl-cards-feed">
              {/* ─── AI Insights Cards ─────────────────────── */}
              <div className="hl-overview-cards">
                {/* Summary Card */}
                <div className="hl-overview-card">
                  <div className="hl-overview-card-header">
                    <IconBrain size={16} />
                    <span className="hl-overview-card-title">{t("highlights.summary_card_title")}</span>
                  </div>
                  {loadingPaperDetail ? (
                    <div className="hl-insight-loading">
                      <IconSpinner size={14} />
                      <span>{t("common.loading")}</span>
                    </div>
                  ) : paperDetail?.auto_summary ? (
                    <div className="hl-insight-summary">
                      {renderSummary(paperDetail.auto_summary)}
                    </div>
                  ) : (
                    <p className="hl-insight-empty">{t("highlights.no_summary")}</p>
                  )}
                </div>

                {/* Concepts Card */}
                <div className="hl-overview-card">
                  <div className="hl-overview-card-header">
                    <IconFileText size={16} />
                    <span className="hl-overview-card-title">{t("highlights.concepts_metadata")}</span>
                  </div>
                  {loadingPaperDetail ? (
                    <div className="hl-insight-loading">
                      <IconSpinner size={14} />
                      <span>{t("common.loading")}</span>
                    </div>
                  ) : parsedTags.length > 0 ? (
                    <div className="hl-insight-tags">
                      {parsedTags.map((tag, i) => (
                        <span key={i} className="hl-insight-tag">{tag}</span>
                      ))}
                    </div>
                  ) : paperDetail?.chunk_count !== undefined ? (
                    <div className="hl-insight-paper-meta">
                      <div className="hl-insight-meta-item">
                        <span className="hl-insight-meta-label">{t("highlights.chunks_label")}</span>
                        <span className="hl-insight-meta-value">{paperDetail.chunk_count}</span>
                      </div>
                      <div className="hl-insight-meta-item">
                        <span className="hl-insight-meta-label">{t("highlights.pages_label")}</span>
                        <span className="hl-insight-meta-value">{selectedPaper.page_count || "?"}</span>
                      </div>
                      {selectedPaper.language && (
                        <div className="hl-insight-meta-item">
                          <span className="hl-insight-meta-label">{t("highlights.language_label")}</span>
                          <span className="hl-insight-meta-value">{selectedPaper.language.toUpperCase()}</span>
                        </div>
                      )}
                      <div className="hl-insight-meta-item">
                        <span className="hl-insight-meta-label">{t("highlights.file_size_label")}</span>
                        <span className="hl-insight-meta-value">{(selectedPaper.file_size / 1024).toFixed(0)} KB</span>
                      </div>
                    </div>
                  ) : (
                    <p className="hl-insight-empty">{t("highlights.no_tags")}</p>
                  )}
                </div>

                {/* Stats Card - only when highlights exist */}
                {highlights.length > 0 && (
                  <div className="hl-overview-card">
                    <div className="hl-overview-card-header">
                      <IconSparkle size={16} />
                      <span className="hl-overview-card-title">{t("highlights.stats_card_title")}</span>
                    </div>
                    <div className="hl-insight-stats">
                      <div className="hl-insight-stat-row highlight">
                        <span className="hl-insight-stat-label">{t("highlights.stat_total")}</span>
                        <span className="hl-insight-stat-value">{insightsStats.total}</span>
                      </div>
                      <div className="hl-insight-stat-row">
                        <span className="hl-insight-stat-label">{t("highlights.stat_high_importance")}</span>
                        <span className="hl-insight-stat-value high">{insightsStats.highCount}</span>
                      </div>
                      <div className="hl-insight-stat-row">
                        <span className="hl-insight-stat-label">{t("highlights.stat_importance_ratio")}</span>
                        <span className="hl-insight-stat-value">{insightsStats.importantRatio}%</span>
                      </div>
                      <div className="hl-insight-divider" />
                      {CATEGORIES.filter(c => c.value !== "all").map((cat) => {
                        const count = insightsStats.counts[cat.value] || 0;
                        if (count === 0) return null;
                        const cs = CATEGORY_STYLES[cat.value] || CATEGORY_STYLES.important_claim;
                        return (
                          <div key={cat.value} className="hl-insight-stat-row">
                            <span className="hl-insight-stat-label">
                              <span className="hl-insight-stat-dot" style={{ background: cs.color }} />
                              {cat.label}
                            </span>
                            <span className="hl-insight-stat-value">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {loadingHighlights ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
                  <div style={{ fontSize: "12.5px", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <IconSpinner size={14} />
                    <span>{t("highlights.analyzing_progress")}</span>
                  </div>
                  <HighlightListSkeleton count={4} />
                </div>
              ) : filteredHighlights.length === 0 && highlightQuery ? (
                <div className="hl-empty-state">
                  <IconSparkle size={36} />
                  <h4>{t("highlights.no_results_heading")}</h4>
                  <p>{t("highlights.no_results_text")}</p>
                </div>
              ) : (
                <>
                  {/* Evidence Cards (only when highlights exist) */}
                  {filteredHighlights.length > 0 && (
                    <div className="hl-cards-grid" ref={resultsAnchorRef}>
                      {/* Context toggle bulk actions */}
                      <div className="hl-bulk-actions">
                        <span className="hl-bulk-label">
                          {t("highlights.bulk_label")}
                        </span>
                        <button
                          type="button"
                          className="hl-bulk-btn"
                          onClick={() => {
                            const all = new Set<string>();
                            filteredHighlights.forEach((h) => all.add(getHighlightId(h)));
                            setContextIncluded(all);
                          }}
                        >
                          {t("highlights.select_all")}
                        </button>
                        <button
                          type="button"
                          className="hl-bulk-btn"
                          onClick={() => setContextIncluded(new Set())}
                        >
                          {t("highlights.deselect")}
                        </button>
                      </div>

                      {filteredHighlights.map((h) => {
                        const hid = getHighlightId(h);
                        const cs = CATEGORY_STYLES[h.category] || CATEGORY_STYLES.important_claim;
                        const isIncluded = contextIncluded.has(hid);

                        return (
                          <div
                            key={hid}
                            className={`hl-evidence-card ${isIncluded ? "included" : ""}`}
                            style={{ borderLeftColor: cs.color }}
                          >
                            {/* Context toggle */}
                            <div
                              className={`hl-context-toggle ${isIncluded ? "active" : ""}`}
                              onClick={() => toggleContext(hid)}
                              title={isIncluded ? t("highlights.remove_context") : t("highlights.add_context")}
                              role="checkbox"
                              aria-checked={isIncluded}
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleContext(hid); } }}
                            >
                              {isIncluded ? (
                                <IconCheck size={12} />
                              ) : (
                                <IconBookOpen size={12} />
                              )}
                            </div>

                            {/* Card header: category badge + importance stars */}
                            <div className="hl-evidence-header">
                              <div className="hl-evidence-header-left">
                                <span
                                  className="hl-evidence-category"
                                  style={{
                                    background: cs.bg,
                                    color: cs.color,
                                    border: `1px solid ${cs.border}`,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  {getCategoryIcon(h.category, 12)}
                                  <span>{CATEGORY_LABELS[h.category] || t("highlights.category_key_points")}</span>
                                </span>
                                {h.page_hint && (
                                  <span className="hl-evidence-page">
                                    <IconFileText size={11} /> {t("highlights.page", { n: h.page_hint })}
                                  </span>
                                )}
                              </div>
                              <div className="hl-evidence-header-right">
                                <span
                                  className={`hl-evidence-importance ${
                                    h.importance === "high" ? "high" : "medium"
                                  }`}
                                  title={
                                    h.importance === "high"
                                      ? t("highlights.importance_high")
                                      : t("highlights.importance_medium")
                                  }
                                >
                                  {renderStars(h.importance)}
                                </span>
                              </div>
                            </div>

                            {/* Evidence text */}
                            <blockquote className="hl-evidence-text">
                              "{h.text}"
                            </blockquote>

                             {/* AI Insight */}
                             {h.note && (
                               <div className="hl-evidence-note" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                 <IconChat size={12} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                                 <span><strong>{t("highlights.note_prefix")}</strong> {h.note}</span>
                               </div>
                             )}

                            {/* Source info bar */}
                            <div className="hl-evidence-source">
                              <span className="hl-evidence-source-label">
                                {t("highlights.source_label", { title: paperDisplayTitle(selectedPaper.title, selectedPaper.filename) })}
                              </span>
                              {h.page_hint && (
                                <span className="hl-evidence-source-page">
                                  {t("highlights.source_page", { n: h.page_hint })}
                                </span>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="hl-evidence-actions">
                              <button
                                type="button"
                                className="hl-evidence-action-btn"
                                onClick={() => handleCopyHighlight(h.text)}
                                title={t("highlights.copy_quote_title")}
                              >
                                <IconCopy size={13} />
                                <span>{t("highlights.copy")}</span>
                              </button>
                              <button
                                type="button"
                                className="hl-evidence-action-btn primary"
                                onClick={() => handleChatWithHighlight()}
                                title={t("highlights.ask_ai_quote_title")}
                              >
                                <IconChat size={13} />
                                <span>{t("highlights.ask_ai")}</span>
                              </button>
                              <button
                                type="button"
                                className="hl-evidence-action-btn outline"
                                onClick={() => handleOpenPdfPage(h.page_hint)}
                                title={h.page_hint ? t("highlights.open_pdf_page", { n: h.page_hint }) : t("highlights.open_pdf")}
                              >
                                <IconFileText size={13} />
                                <span>{h.page_hint ? t("highlights.source_page", { n: h.page_hint }) : t("highlights.open_pdf")}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Empty state when no highlights and no search */}
                  {filteredHighlights.length === 0 && !highlightQuery && (
                    <div className="hl-empty-state">
                      <IconSparkle size={40} className="icon-gradient" />
                      <h4>{t("highlights.no_evidence_heading")}</h4>
                      <p>{t("highlights.no_evidence_text")}</p>
                      <button
                        type="button"
                        className="hl-extract-btn"
                        onClick={() => selectedPaper && loadHighlights(selectedPaper.id)}
                      >
                        <IconSparkle size={16} /> {t("highlights.start_extract")}
                      </button>
                    </div>
                  )}

                  {/* ─── Generate Section ──────────────────────────── */}
                  <div className="hl-generate-section">
                    <div className="hl-generate-header">
                      <IconBulb size={16} />
                      <span className="hl-generate-title">{t("highlights.generate_section")}</span>
                    </div>

                    {/* Action cards */}
                    <div className="hl-generate-actions">
                      {GENERATE_OPTIONS.map((opt) => {
                        const isGenerating = generatingType === opt.id;
                        const result = generateResults.find(r => r.type === opt.id);
                        return (
                          <div key={opt.id} className={`hl-generate-action ${result ? "has-result" : ""}`}>
                            <div className="hl-generate-action-row">
                              <div className="hl-generate-action-info">
                                <span className="hl-generate-action-label">{opt.label}</span>
                                <span className="hl-generate-action-desc">{opt.desc}</span>
                              </div>
                              <button
                                type="button"
                                className={`hl-generate-action-btn ${isGenerating ? "generating" : ""}`}
                                onClick={() => handleGenerateOne(opt.id)}
                                disabled={generatingType !== null}
                              >
                                {isGenerating ? (
                                  <><IconSpinner size={13} /> {t("highlights.generating")}</>
                                ) : result ? (
                                  t("highlights.regenerate")
                                ) : (
                                  t("highlights.generate")
                                )}
                              </button>
                            </div>
                            {isGenerating && (
                              <div className="hl-generate-action-loading">
                                <IconSpinner size={13} />
                                <span>{t("highlights.generating_with_name", { name: opt.label.toLowerCase() })}</span>
                              </div>
                            )}
                            {result && (
                              <div className="hl-generate-action-result">
                                <div className="hl-generate-result-content">
                                  <MarkdownRenderer text={result.result.answer} />
                                </div>
                                {result.result.citations.length > 0 && (
                                  <div className="hl-generate-result-citations">
                                    <span className="hl-generate-citations-label">{t("highlights.sources_label")}</span>
                                    {result.result.citations.map((c, i) => (
                                      <span key={i} className="hl-generate-citation">
                                        {c.source}{c.page ? ` (${t("highlights.page_prefix", { n: c.page })})` : ""}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {generateError && (
                      <div className="hl-generate-error">{generateError}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="hl-no-paper">
            <IconFileText size={48} />
            <h3>{t("highlights.no_doc_heading")}</h3>
            <p>{t("highlights.no_doc_text")}</p>
          </div>
        )}
      </div>



      {/* PDF Viewer Overlay */}
      {showPdfOverlay && pdfOverlayUrl && (          <div
            className="hl-pdf-overlay"
            onClick={() => setShowPdfOverlay(false)}
            role="dialog"
            aria-modal="true"
          >
          <div
            className="hl-pdf-overlay-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hl-pdf-overlay-header">
              <div className="hl-pdf-overlay-header-left">
                <IconFileText size={16} />
                <span className="hl-pdf-overlay-title">
                  {selectedPaper ? paperDisplayTitle(selectedPaper.title, selectedPaper.filename) : "PDF Viewer"}
                </span>
                {pdfOverlayUrl?.includes("#page=") && (
                  <span className="hl-pdf-overlay-page-badge">
                    <IconFileText size={12} /> {t("highlights.page", { n: pdfOverlayUrl.split("#page=")[1] })}
                  </span>
                )}
              </div>
              <div className="hl-pdf-overlay-header-actions">
                <button
                  type="button"
                  className="hl-pdf-overlay-open-btn"
                  onClick={() => window.open(pdfOverlayUrl, "_blank")}                                title={t("common.open_new_tab")}
                              >
                                <IconFileText size={13} />
                                <span>{t("common.open_new_tab")}</span>
                </button>
                <button
                  type="button"
                  className="hl-pdf-overlay-close-btn"
                  onClick={() => setShowPdfOverlay(false)}                                title={t("common.close_esc")}
                >
                  ✕
                </button>
              </div>
            </div>
            <iframe
              src={pdfOverlayUrl}
              className="hl-pdf-overlay-iframe"
              title={selectedPaper?.title || t("pdf.preview_title")}
            />
          </div>
        </div>
      )}
    </div>
  );
};
