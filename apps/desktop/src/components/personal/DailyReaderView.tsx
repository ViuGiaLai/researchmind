import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DailyReaderResponse, DailyPaper } from "../../lib/api";
import { IconBrain, IconSpinner, IconBook, IconStar, IconCalendar, IconBookOpen, IconLibrary, IconRefresh } from "../Icons";

export const DailyReaderView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<DailyReaderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState(true);

  useEffect(() => {
    loadDailyReader();
  }, []);

  const loadDailyReader = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDailyReader();
      setData(result);
    } catch (e) {
      console.error("Failed to load daily reader:", e);
      setError(t("daily_reader.error_loading"));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="daily-reader-view">
        <div className="daily-reader-loading">
          <IconSpinner size={32} />
          <span>{t("daily_reader.loading")}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="daily-reader-view">
        <div className="daily-reader-error">
          <p>{error}</p>
          <button className="daily-reader-retry" onClick={loadDailyReader}>
            {t("daily_reader.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { daily_suggestion, unread_papers, reading_streak, stats } = data;

  const today = new Date().toLocaleDateString(i18n.language === "vi" ? "vi-VN" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="daily-reader-view">
      {/* Hero */}
      <div className="daily-reader-hero">
        <div className="daily-reader-hero-top">
          <div>
            <h1 className="daily-reader-hero-title" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <IconBookOpen size={24} className="icon-gradient" />
              <span>{t("daily_reader.hero_title")}</span>
            </h1>
            <p className="daily-reader-hero-date">{today}</p>
          </div>
          {reading_streak > 0 && (
            <div className="daily-reader-streak">
              <IconCalendar size={18} />
              <span className="daily-reader-streak-count">{reading_streak}</span>
              <span className="daily-reader-streak-label">{t("daily_reader.streak_days")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="daily-reader-stats">
        <div className="daily-reader-stat">
          <span className="daily-reader-stat-value">{stats.total}</span>
          <span className="daily-reader-stat-label">{t("daily_reader.stat_total")}</span>
        </div>
        <div className="daily-reader-stat">
          <span className="daily-reader-stat-value unread">{stats.unread}</span>
          <span className="daily-reader-stat-label">{t("daily_reader.stat_unread")}</span>
        </div>
        <div className="daily-reader-stat">
          <span className="daily-reader-stat-value reading">{stats.reading}</span>
          <span className="daily-reader-stat-label">{t("daily_reader.stat_reading")}</span>
        </div>
        <div className="daily-reader-stat">
          <span className="daily-reader-stat-value read">{stats.read}</span>
          <span className="daily-reader-stat-label">{t("daily_reader.stat_read")}</span>
        </div>
      </div>

      {/* AI Daily Suggestion */}
      {daily_suggestion && (
        <div className="daily-reader-section">
          <div
            className="daily-reader-section-header"
            onClick={() => setExpandedSuggestion(!expandedSuggestion)}
            style={{ cursor: "pointer" }}
          >
            <h3 className="daily-reader-section-title">
              <IconBrain size={20} className="icon-gradient" style={{ marginRight: 8 }} />
              {t("daily_reader.ai_suggestion")}
            </h3>
            <span className="daily-reader-expand-icon">
              {expandedSuggestion ? "▼" : "▶"}
            </span>
          </div>
          {expandedSuggestion && (
            <div className="daily-reader-suggestion-content">
              <div className="daily-reader-markdown">
                {daily_suggestion.suggestion.split("\n").map((line, i) => {
                  if (line.startsWith("###")) return <h4 key={i} className="daily-reader-md-heading">{line.replace(/^#+\s*/, "")}</h4>;
                  if (line.startsWith("##")) return <h3 key={i} className="daily-reader-md-heading">{line.replace(/^#+\s*/, "")}</h3>;
                  if (line.startsWith("- ")) return <p key={i} className="daily-reader-md-list">• {line.slice(2)}</p>;
                  if (line.startsWith("* ")) return <p key={i} className="daily-reader-md-list">• {line.slice(2)}</p>;
                  if (line.trim()) return <p key={i} className="daily-reader-md-text">{line}</p>;
                  return null;
                })}
              </div>
              <div className="daily-reader-model-badge">
                {daily_suggestion.model_used}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {unread_papers.length === 0 && !daily_suggestion && (
        <div className="daily-reader-empty">
          <IconBook size={48} style={{ color: "var(--color-text-muted)", opacity: 0.5 }} />
          <h3>{t("daily_reader.empty_library")}</h3>
          <p>{t("daily_reader.empty_library_hint")}</p>
        </div>
      )}

      {/* Unread Papers - Prioritized */}
      {unread_papers.length > 0 && (
        <div className="daily-reader-section">
          <h3 className="daily-reader-section-title" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <IconLibrary size={18} className="icon-gradient" />              <span>{t("daily_reader.papers_to_read", { count: unread_papers.length })}</span>
          </h3>
          <div className="daily-reader-paper-list">
            {unread_papers.map((paper, i) => (
              <DailyPaperCard key={paper.paper_id} paper={paper} index={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Refresh button */}
      <div className="daily-reader-actions">
        <button 
          className="daily-reader-refresh-btn" 
          onClick={loadDailyReader} 
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          {loading ? <IconSpinner size={16} /> : <IconRefresh size={16} />}
          <span>{t("daily_reader.refresh")}</span>
        </button>
      </div>
    </div>
  );
};

// ─── Paper Card Component ──────────────────────────────────

const DailyPaperCard: React.FC<{ paper: DailyPaper; index: number }> = ({ paper, index }) => {
  const { t } = useTranslation();
  return (
    <div className="daily-reader-paper-card">
      <div className="daily-reader-paper-rank">#{index}</div>
      <div className="daily-reader-paper-info">
        <div className="daily-reader-paper-header">
          <span className="daily-reader-paper-title">{paper.title}</span>
          {paper.starred && (
            <IconStar size={14} style={{ color: "var(--color-warning, #eab308)" }} />
          )}
        </div>
        <div className="daily-reader-paper-meta">
          {paper.authors && <span>{paper.authors}</span>}
          {paper.year && <span>· {paper.year}</span>}
          <span>· {paper.pages} {t("daily_reader.pages_unit")}</span>
          {paper.has_summary &&          <span className="daily-reader-badge">{t("daily_reader.has_summary")}</span>}
        </div>
        {paper.tags.length > 0 && (
          <div className="daily-reader-paper-tags">
            {paper.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="daily-reader-paper-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
