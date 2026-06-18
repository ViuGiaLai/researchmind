import React, { useState, useEffect } from "react";
import { api, Paper } from "../../lib/api";
import {
  IconBrain,
  IconSpinner,
  IconSearch,
  IconChat,
  IconBulb,
  IconError,
} from "../Icons";

interface InsightResult {
  answer: string;
  citations: { source: string; page: number | null; text: string }[];
  model_used: string;
  papers_used: string[];
  chunks_used: number;
}

const INSIGHT_CARDS = [
  {
    id: "gap",
    icon: "🔍",
    title: "Research Gap Finder",
    description: "Tìm lỗ hổng nghiên cứu — chỗ nào chưa ai làm tốt",
    color: "#10b981",
  },
  {
    id: "conflict",
    icon: "⚠️",
    title: "Conflict Finder",
    description: "Phát hiện mâu thuẫn giữa các paper trong thư viện",
    color: "#f59e0b",
  },
  {
    id: "topic",
    icon: "💡",
    title: "Topic Generator",
    description: "AI đề xuất đề tài nghiên cứu dựa trên thư viện của bạn",
    color: "#2dd4bf",
  },
  {
    id: "evolution",
    icon: "🧬",
    title: "Evolution Map",
    description: "Xem sự phát triển của các ý tưởng nghiên cứu qua thời gian",
    color: "#06b6d4",
  },
];

export const InsightsView: React.FC<{
  onStartChat: (paperIds: string[]) => void;
}> = ({ onStartChat }) => {
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(true);
  const [result, setResult] = useState<InsightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPapers();
  }, []);

  const loadPapers = async () => {
    setLoadingPapers(true);
    try {
      const res = await api.listPapers(1, 100, "indexed");
      setPapers(res.papers);
    } catch (e) {
      console.error("Failed to load papers:", e);
    } finally {
      setLoadingPapers(false);
    }
  };

  const togglePaper = (id: string) => {
    setSelectedPaperIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      return [...prev, id];
    });
  };

  const selectAll = () => {
    setSelectedPaperIds(papers.map((p) => p.id));
  };

  const runInsight = async () => {
    if (!activeInsight) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const paperIds =
        selectedPaperIds.length > 0 ? selectedPaperIds : undefined;

      if (activeInsight === "gap") {
        const res = await api.findResearchGap(paperIds);
        setResult(res);
      } else if (activeInsight === "conflict") {
        const res = await api.findConflicts(paperIds);
        setResult(res);
      } else if (activeInsight === "topic") {
        const res = await api.findTopicSuggestions(paperIds);
        setResult(res);
      } else if (activeInsight === "evolution") {
        const res = await api.findEvolutionMap(paperIds);
        setResult(res);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Lỗi không xác định"
      );
    } finally {
      setLoading(false);
    }
  };

  const renderMarkdown = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("###"))
        return (
          <h4 key={i} className="insight-heading">
            {line.replace(/^#+\s*/, "")}
          </h4>
        );
      if (line.startsWith("##"))
        return (
          <h3 key={i} className="insight-heading-2">
            {line.replace(/^#+\s*/, "")}
          </h3>
        );
      if (line.startsWith("* **")) {
        const parts = line.replace(/^\*\s*/, "").split(":");
        const label = parts[0]?.replace(/\*\*/g, "") || "";
        const value = parts.slice(1).join(":").trim();
        return (
          <div key={i} className="insight-item">
            <span className="insight-item-label">{label}</span>
            <span className="insight-item-value">{value}</span>
          </div>
        );
      }
      if (line.startsWith("- ") || line.startsWith("• "))
        return (
          <li key={i} className="insight-list-item">
            {line.replace(/^[-•]\s*/, "")}
          </li>
        );
      if (line.trim()) return <p key={i} className="insight-text">{line}</p>;
      return null;
    });
  };

  // Main view: select insight type
  if (!activeInsight) {
    return (
      <div className="insights-view">
        <div className="insights-hero">
          <h2 className="insights-hero-title">
            <IconBrain
              size={28}
              className="icon-gradient"
              style={{ verticalAlign: "middle", marginRight: 8 }}
            />
            Insights
          </h2>
          <p className="insights-hero-desc">
            Phân tích thông minh từ thư viện nghiên cứu của bạn
          </p>
        </div>

        <div className="insights-cards-grid">
          {INSIGHT_CARDS.map((card) => (
            <button
              key={card.id}
              className="insight-type-card"
              onClick={() => setActiveInsight(card.id)}
            >
              <span className="insight-type-icon">{card.icon}</span>
              <h3 className="insight-type-title">{card.title}</h3>
              <p className="insight-type-desc">{card.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Paper selection + run view
  const activeCard = INSIGHT_CARDS.find((c) => c.id === activeInsight);

  return (
    <div className="insights-view">
      <div className="insights-header">
        <button
          className="insights-back-btn"
          onClick={() => {
            setActiveInsight(null);
            setResult(null);
            setError(null);
          }}
        >
          ← Quay lại
        </button>
        <h2 className="insights-title">
          <span>{activeCard?.icon}</span>
          <span>{activeCard?.title}</span>
        </h2>
      </div>

      {/* Paper selection */}
      {!result && !loading && (
        <div className="insights-paper-select">
          <div className="insights-paper-select-header">
            <span className="insights-paper-count">
              {selectedPaperIds.length > 0
                ? `Đã chọn ${selectedPaperIds.length} paper`
                : `Chọn paper để phân tích (hoặc bỏ trống = tất cả ${papers.length} paper)`}
            </span>
            <button className="insights-select-all-btn" onClick={selectAll}>
              Chọn tất cả
            </button>
          </div>

          {loadingPapers ? (
            <div className="insights-loading">
              <IconSpinner size={20} />
              <span>Đang tải danh sách paper...</span>
            </div>
          ) : papers.length === 0 ? (
            <div className="insights-empty">
              <IconBulb size={40} className="icon-gradient" style={{ marginBottom: 8 }} />
              <p>Chưa có paper nào được index. Hãy import PDF trước.</p>
            </div>
          ) : (
            <div className="insights-paper-list">
              {papers.map((p) => (
                <button
                  key={p.id}
                  className={`insights-paper-chip ${
                    selectedPaperIds.includes(p.id) ? "selected" : ""
                  }`}
                  onClick={() => togglePaper(p.id)}
                >
                  <span className="insights-paper-chip-check">
                    {selectedPaperIds.includes(p.id) ? "✓" : ""}
                  </span>
                  <span className="insights-paper-chip-title">
                    {p.title || p.filename}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            className="insights-run-btn"
            onClick={runInsight}
            disabled={loading || (papers.length === 0 && !loadingPapers)}
          >
            {loading ? (
              <>
                <IconSpinner size={18} />
                <span>Đang phân tích...</span>
              </>
            ) : (
              <>
                <IconSearch size={18} />
                <span>
                  {activeInsight === "gap"
                    ? "Tìm Research Gaps"
                    : activeInsight === "conflict"
                    ? "Tìm Mâu Thuẫn"
                    : activeInsight === "topic"
                    ? "Đề xuất đề tài"
                    : "Phân tích Evolution Map"}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="insights-loading-large">
          <div className="insights-loading-spinner" />
          <h3>AI đang phân tích thư viện của bạn...</h3>
          <p>Quá trình này có thể mất 10-30 giây</p>
        </div>
      )}

      {/* Error */}
      {error && (          <div className="insights-error">
          <IconError size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="insights-result">
          <div className="insights-result-header">
            <h3>{activeCard?.icon} Kết quả phân tích</h3>
            <div className="insights-result-meta">
              <span>{result.papers_used.length} papers phân tích</span>
              <span>·</span>
              <span>{result.chunks_used} chunks tham chiếu</span>
              <span>·</span>
              <span>{result.model_used}</span>
            </div>
            {result.papers_used.length > 0 && (
              <div className="insights-papers-list">
                {result.papers_used.map((pid) => {
                  const p = papers.find((pp) => pp.id === pid);
                  const title = p?.title || p?.filename || pid.slice(0, 12);
                  return <span key={pid} className="insights-paper-tag">{title}</span>;
                })}
              </div>
            )}
          </div>

          <div className="insights-result-content">
            {renderMarkdown(result.answer)}
          </div>

          {result.citations.length > 0 && (
            <div className="insights-citations">
              <h4>Nguồn tham chiếu:</h4>
              <div className="insights-citations-list">
                {result.citations.map((c, i) => (
                  <span key={i} className="insights-citation-tag">
                    {c.source}
                    {c.page ? ` (trang ${c.page})` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="insights-result-actions">
            <button
              className="insights-action-btn"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
            >
              Phân tích lại
            </button>
            <button
              className="insights-action-btn primary"
              onClick={() => onStartChat(result.papers_used)}
            >
              <IconChat size={16} />
              Hỏi thêm về kết quả này
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
