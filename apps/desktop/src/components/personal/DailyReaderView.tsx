import React, { useEffect, useState } from "react";
import { api, DailyReaderResponse, DailyPaper } from "../../lib/api";
import { IconBrain, IconSpinner, IconBook, IconStar, IconCalendar } from "../Icons";

export const DailyReaderView: React.FC = () => {
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
      setError("Không thể tải dữ liệu. Đảm bảo backend đang chạy.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="daily-reader-view">
        <div className="daily-reader-loading">
          <IconSpinner size={32} />
          <span>AI đang phân tích và chuẩn bị gợi ý cho bạn...</span>
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
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { daily_suggestion, unread_papers, reading_streak, stats } = data;

  const today = new Date().toLocaleDateString("vi-VN", {
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
            <h1 className="daily-reader-hero-title">📰 Đọc gì hôm nay?</h1>
            <p className="daily-reader-hero-date">{today}</p>
          </div>
          {reading_streak > 0 && (
            <div className="daily-reader-streak">
              <IconCalendar size={18} />
              <span className="daily-reader-streak-count">{reading_streak}</span>
              <span className="daily-reader-streak-label">ngày liên tiếp</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="daily-reader-stats">
        <div className="daily-reader-stat">
          <span className="daily-reader-stat-value">{stats.total}</span>
          <span className="daily-reader-stat-label">Tổng papers</span>
        </div>
        <div className="daily-reader-stat">
          <span className="daily-reader-stat-value unread">{stats.unread}</span>
          <span className="daily-reader-stat-label">Chưa đọc</span>
        </div>
        <div className="daily-reader-stat">
          <span className="daily-reader-stat-value reading">{stats.reading}</span>
          <span className="daily-reader-stat-label">Đang đọc</span>
        </div>
        <div className="daily-reader-stat">
          <span className="daily-reader-stat-value read">{stats.read}</span>
          <span className="daily-reader-stat-label">Đã đọc</span>
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
              Gợi ý hôm nay từ AI
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
          <h3>Thư viện trống</h3>
          <p>Hãy import PDF đầu tiên để bắt đầu hành trình nghiên cứu!</p>
        </div>
      )}

      {/* Unread Papers - Prioritized */}
      {unread_papers.length > 0 && (
        <div className="daily-reader-section">
          <h3 className="daily-reader-section-title">
            📋 Paper nên đọc ({unread_papers.length})
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
        <button className="daily-reader-refresh-btn" onClick={loadDailyReader} disabled={loading}>
          {loading ? "Đang tải..." : "🔄 Làm mới gợi ý"}
        </button>
      </div>
    </div>
  );
};

// ─── Paper Card Component ──────────────────────────────────

const DailyPaperCard: React.FC<{ paper: DailyPaper; index: number }> = ({ paper, index }) => {
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
          <span>· {paper.pages} trang</span>
          {paper.has_summary && <span className="daily-reader-badge">✓ Có tóm tắt</span>}
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
