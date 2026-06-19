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
  matrix?: { columns: string[]; rows: string[][] };
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
  {
    id: "compare",
    icon: "📊",
    title: "Literature Matrix",
    description: "So sánh đối chiếu mục tiêu, phương pháp, kết quả, hạn chế giữa các bài báo",
    color: "#6366f1",
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
  const [exporting, setExporting] = useState(false);

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

  const handleExport = async (format: "docx" | "html") => {
    if (!result) return;
    setExporting(true);
    try {
      const title = `Ma_tran_so_sanh_${selectedPaperIds.length}_tai_lieu`;
      const blob = await api.exportSynthesis(title, result.answer, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Export synthesis failed:", e);
      alert("Xuất file thất bại: " + (e.message || String(e)));
    } finally {
      setExporting(false);
    }
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
      } else if (activeInsight === "compare") {
        if (selectedPaperIds.length < 2) {
          setError("Vui lòng chọn ít nhất 2 tài liệu để tiến hành so sánh.");
          setLoading(false);
          return;
        }
        const res = await api.comparePapers(selectedPaperIds);
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
                : activeInsight === "compare"
                ? "Vui lòng chọn ít nhất 2 paper từ danh sách bên dưới để so sánh"
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
            disabled={loading || (papers.length === 0 && !loadingPapers) || (activeInsight === "compare" && selectedPaperIds.length < 2)}
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
                    : activeInsight === "evolution"
                    ? "Phân tích Evolution Map"
                    : "Lập ma trận so sánh"}
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
      {error && (
        <div className="insights-error">
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
            {result.matrix ? (
              <div className="insights-comparison-table-wrapper" style={{ overflowX: "auto", margin: "20px 0", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
                <table className="insights-comparison-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "rgba(99, 102, 241, 0.08)", borderBottom: "2px solid var(--color-border)" }}>
                      {result.matrix.columns.map((col, idx) => (
                        <th key={idx} style={{ padding: "12px 16px", fontWeight: "bold", borderRight: "1px solid var(--color-border)", minWidth: idx === 0 ? "160px" : "260px", verticalAlign: "top", color: "var(--color-text)" }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.matrix.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} style={{ background: rowIdx % 2 === 1 ? "var(--color-bg-hover, #f8fafc)" : "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} style={{ padding: "12px 16px", borderRight: "1px solid var(--color-border)", lineHeight: "1.5", color: cellIdx === 0 ? "var(--color-text)" : "var(--color-text-secondary)", fontWeight: cellIdx === 0 ? "bold" : "normal", verticalAlign: "top" }}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              renderMarkdown(result.answer)
            )}
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
            {result.matrix && (
              <>
                <button
                  className="insights-action-btn primary"
                  onClick={() => handleExport("docx")}
                  disabled={exporting}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  {exporting ? <IconSpinner size={14} /> : "📄"}
                  Xuất Word (DOCX)
                </button>
                <button
                  className="insights-action-btn primary"
                  onClick={() => handleExport("html")}
                  disabled={exporting}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  {exporting ? <IconSpinner size={14} /> : "🌐"}
                  Xuất HTML
                </button>
              </>
            )}
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
