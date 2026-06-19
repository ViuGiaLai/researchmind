import React, { useEffect, useState } from "react";
import { api, Paper, Highlight } from "../../lib/api";
import { useToast } from "../shared/Toast";
import {
  IconSearch,
  IconSpinner,
  IconFileText,
  IconCopy,
  IconChat,
  IconSparkle,
} from "../Icons";

export const HighlightsLibraryView: React.FC<{
  onStartChat: (paperIds: string[]) => void;
}> = ({ onStartChat }) => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [searchPaperQuery, setSearchPaperQuery] = useState("");
  const [highlightQuery, setHighlightQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const toast = useToast();

  useEffect(() => {
    loadPapers();
  }, []);

  useEffect(() => {
    if (selectedPaper) {
      loadHighlights(selectedPaper.id);
    } else {
      setHighlights([]);
    }
  }, [selectedPaper?.id]);

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
    toast.addToast("success", "📋 Đã sao chép đoạn trích vào clipboard!");
  };

  const filteredPapers = papers.filter((p) =>
    (p.title || p.filename).toLowerCase().includes(searchPaperQuery.toLowerCase())
  );

  const filteredHighlights = highlights.filter((h) => {
    const matchesSearch =
      h.text.toLowerCase().includes(highlightQuery.toLowerCase()) ||
      h.note.toLowerCase().includes(highlightQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || h.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="highlights-library-container" style={{ display: "flex", height: "100%", width: "100%", background: "var(--color-bg)" }}>
      {/* Left sidebar: Paper list */}
      <div className="hl-sidebar" style={{ width: "320px", borderRight: "1px solid var(--color-border)", display: "flex", flexDirection: "column", height: "100%", background: "var(--color-bg-sidebar, var(--color-bg))" }}>
        <div style={{ padding: "16px", borderBottom: "1px solid var(--color-border)" }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text)" }}>
            📖 Chọn tài liệu
          </h3>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Tìm tài liệu..."
              value={searchPaperQuery}
              onChange={(e) => setSearchPaperQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                borderRadius: "var(--radius-md, 6px)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: "0.85rem",
              }}
            />
            <IconSearch size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {loadingPapers ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "32px", gap: "8px" }}>
              <IconSpinner size={18} />
              <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Đang tải...</span>
            </div>
          ) : filteredPapers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              Không tìm thấy tài liệu phù hợp.
            </div>
          ) : (
            filteredPapers.map((p) => {
              const isActive = selectedPaper?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPaper(p)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md, 6px)",
                    marginBottom: "4px",
                    cursor: "pointer",
                    background: isActive ? "rgba(99, 102, 241, 0.1)" : "transparent",
                    border: isActive ? "1px solid var(--color-primary, #6366f1)" : "1px solid transparent",
                    transition: "all 0.2s",
                  }}
                  className="hl-paper-item"
                >
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", color: isActive ? "var(--color-primary, #6366f1)" : "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.title || p.filename}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.authors && p.authors !== "[]" ? p.authors.replace(/[\[\]"']/g, "") : "Chưa cập nhật tác giả"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right side: Highlights panel */}
      <div className="hl-content" style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", padding: "20px", overflowY: "auto" }}>
        {selectedPaper ? (
          <>
            <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "16px", marginBottom: "20px" }}>
              <span style={{ fontSize: "0.75rem", background: "rgba(99, 102, 241, 0.1)", color: "var(--color-primary)", padding: "2px 8px", borderRadius: "12px", fontWeight: "bold" }}>
                Đang xem đoạn trích
              </span>
              <h2 style={{ fontSize: "1.4rem", margin: "8px 0 4px 0", color: "var(--color-text)" }}>
                {selectedPaper.title || selectedPaper.filename}
              </h2>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                Tác giả: {selectedPaper.authors && selectedPaper.authors !== "[]" ? selectedPaper.authors.replace(/[\[\]"']/g, "") : "Không rõ"} • Năm: {selectedPaper.year || "N/A"}
              </p>
            </div>

            {/* Filter and search bars */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "20px", alignItems: "center", justifyContent: "space-between" }}>
              {/* Category chips */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[
                  { value: "all", label: "Tất cả" },
                  { value: "key_finding", label: "🔬 Kết quả chính" },
                  { value: "methodology", label: "⚙️ Phương pháp" },
                  { value: "conclusion", label: "📋 Kết luận" },
                  { value: "novel_contribution", label: "💡 Đóng góp" },
                  { value: "limitation", label: "⚠️ Hạn chế" },
                  { value: "important_claim", label: "📌 Ý chính" },
                ].map((cat) => {
                  const isActive = categoryFilter === cat.value;
                  return (
                    <button
                      key={cat.value}
                      onClick={() => setCategoryFilter(cat.value)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "15px",
                        border: "1px solid var(--color-border)",
                        background: isActive ? "var(--color-primary, #6366f1)" : "var(--color-surface)",
                        color: isActive ? "#ffffff" : "var(--color-text)",
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Highlights Search */}
              <div style={{ position: "relative", minWidth: "220px" }}>
                <input
                  type="text"
                  placeholder="Tìm từ khoá đoạn trích..."
                  value={highlightQuery}
                  onChange={(e) => setHighlightQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 12px 6px 28px",
                    borderRadius: "var(--radius-md, 6px)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.82rem",
                  }}
                />
                <IconSearch size={12} style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
              </div>
            </div>

            {/* Highlights Feed */}
            {loadingHighlights ? (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", flex: 1, padding: "64px" }}>
                <IconSpinner size={32} />
                <span style={{ marginTop: "12px", fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
                  AI đang phân tích & trích xuất các đoạn thông tin đắt giá nhất...
                </span>
              </div>
            ) : filteredHighlights.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px", background: "var(--color-bg-hover, #f8fafc)", borderRadius: "var(--radius-lg, 8px)", border: "1px dashed var(--color-border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1 }}>
                <IconSparkle size={40} className="icon-gradient" style={{ marginBottom: "12px" }} />
                <h4 style={{ margin: "0 0 8px 0", color: "var(--color-text)" }}>Chưa có dữ liệu đoạn trích</h4>
                <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "var(--color-text-muted)", maxWidth: "400px" }}>
                  Hãy nhấp phân tích lại để AI tự động trích xuất các nhận định, kết quả, phương pháp quan trọng từ bài nghiên cứu này.
                </p>
                <button
                  onClick={() => loadHighlights(selectedPaper.id)}
                  style={{
                    padding: "8px 16px",
                    background: "var(--color-primary, #6366f1)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md, 6px)",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  🚀 Bắt đầu trích xuất
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                {filteredHighlights.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md, 8px)",
                      background: "var(--color-surface)",
                      padding: "16px",
                      position: "relative",
                      transition: "transform 0.2s, box-shadow 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                    className="highlight-library-card"
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: "bold",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background:
                            h.category === "key_finding" ? "rgba(34, 197, 94, 0.15)"
                            : h.category === "methodology" ? "rgba(99, 102, 241, 0.15)"
                            : h.category === "conclusion" ? "rgba(168, 85, 247, 0.15)"
                            : h.category === "novel_contribution" ? "rgba(236, 72, 153, 0.15)"
                            : h.category === "limitation" ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(148, 163, 184, 0.15)",
                          color:
                            h.category === "key_finding" ? "#16a34a"
                            : h.category === "methodology" ? "#4f46e5"
                            : h.category === "conclusion" ? "#9333ea"
                            : h.category === "novel_contribution" ? "#db2777"
                            : h.category === "limitation" ? "#dc2626"
                            : "#475569",
                        }}
                      >
                        {h.category === "key_finding" ? "🔬 Kết quả chính"
                          : h.category === "methodology" ? "⚙️ Phương pháp"
                          : h.category === "conclusion" ? "📋 Kết luận"
                          : h.category === "novel_contribution" ? "💡 Đóng góp mới"
                          : h.category === "limitation" ? "⚠️ Hạn chế"
                          : "📌 Ý chính"}
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {h.page_hint && (
                          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                            Trang {h.page_hint}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: "0.7rem",
                            padding: "2px 6px",
                            borderRadius: "10px",
                            background: h.importance === "high" ? "#fee2e2" : "#fef9c3",
                            color: h.importance === "high" ? "#ef4444" : "#ca8a04",
                            fontWeight: "bold",
                          }}
                        >
                          {h.importance === "high" ? "Quan trọng" : "Trung bình"}
                        </span>
                      </div>
                    </div>

                    <blockquote
                      style={{
                        margin: "0 0 12px 0",
                        paddingLeft: "12px",
                        borderLeft: "3px solid var(--color-primary, #6366f1)",
                        fontSize: "0.9rem",
                        fontStyle: "italic",
                        color: "var(--color-text)",
                        lineHeight: "1.5",
                      }}
                    >
                      "{h.text}"
                    </blockquote>

                    {h.note && (
                      <div
                        style={{
                          fontSize: "0.82rem",
                          background: "var(--color-bg-hover, #f8fafc)",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          color: "var(--color-text-secondary)",
                          marginBottom: "12px",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        💡 <strong>Phân tích:</strong> {h.note}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--color-border)", paddingTop: "12px" }}>
                      <button
                        onClick={() => handleCopyHighlight(h.text)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: "transparent",
                          border: "1px solid var(--color-border)",
                          borderRadius: "4px",
                          padding: "4px 8px",
                          fontSize: "0.78rem",
                          cursor: "pointer",
                          color: "var(--color-text)",
                        }}
                      >
                        <IconCopy size={12} /> Sao chép
                      </button>
                      <button
                        onClick={() => onStartChat([selectedPaper.id])}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: "rgba(99, 102, 241, 0.1)",
                          border: "1px solid var(--color-primary, #6366f1)",
                          borderRadius: "4px",
                          padding: "4px 8px",
                          fontSize: "0.78rem",
                          cursor: "pointer",
                          color: "var(--color-primary, #6366f1)",
                          fontWeight: 600,
                        }}
                      >
                        <IconChat size={12} /> Hỏi AI về đoạn này
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", flex: 1, color: "var(--color-text-muted)" }}>
            <IconFileText size={48} style={{ marginBottom: "12px" }} />
            <h3>Chưa chọn tài liệu</h3>
            <p>Vui lòng chọn tài liệu ở thanh bên trái để xem các đoạn trích quan trọng.</p>
          </div>
        )}
      </div>
    </div>
  );
};
