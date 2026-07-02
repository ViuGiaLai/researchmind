import React, { useState, useCallback, useEffect } from "react";
import { api, BASE_URL } from "../../lib/api";
import { useToast } from "../shared/Toast";
import { IconSpinner, IconFileText, IconDownload, IconSearch, IconBrain, IconClock, IconClose } from "../Icons";

interface EvidenceCell {
  paper_id: string;
  paper_title: string;
  value: string;
  quote: string;
  page: number | null;
  confidence: "high" | "medium" | "low";
  status: "ai_extracted" | "user_verified";
}

interface EvidenceMatrix {
  columns: string[];
  rows: {
    criterion: string;
    cells: EvidenceCell[];
  }[];
}

interface HistoryEntry {
  id: string;
  title: string;
  timestamp: number;
  paperIds: string[];
  paperNames: string[];
  matrix: EvidenceMatrix;
}

const STORAGE_KEY = "evidence-matrix-history";

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " +
    d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export const EvidenceMatrixView: React.FC = () => {
  const [papers, setPapers] = useState<{ id: string; title: string; authors: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [matrix, setMatrix] = useState<EvidenceMatrix | null>(null);
  const [expandedCell, setExpandedCell] = useState<{ row: number; col: number } | null>(null);
  const [activePdf, setActivePdf] = useState<{ paperId: string; page: number; quote: string } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const toast = useToast();

  useEffect(() => {
    api.listPapers(1, 100).then(data => {
      setPapers(data.papers.map(p => ({ id: p.id, title: p.title || p.filename, authors: p.authors || "" })));
    }).catch(() => {});
  }, []);

  const selectAll = () => {
    setSelectedIds(papers.map(p => p.id));
  };

  const deselectAll = () => {
    setSelectedIds([]);
  };

  const togglePaper = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const generateMatrix = useCallback(async () => {
    if (selectedIds.length < 2) {
      toast.addToast("error", "Chọn ít nhất 2 bài báo để so sánh");
      return;
    }
    setGenerating(true);
    setMatrix(null);
    try {
      const res = await api.generateEvidenceMatrix(selectedIds);
      const m = res.matrix;
      setMatrix(m);

      const paperNames = selectedIds
        .map(id => papers.find(p => p.id === id)?.title || id)
        .map(t => t.length > 30 ? t.slice(0, 30) + "..." : t);

      const title = autoTitle(paperNames);
      const entry: HistoryEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title,
        timestamp: Date.now(),
        paperIds: [...selectedIds],
        paperNames,
        matrix: m,
      };
      const updated = [entry, ...history].slice(0, 20);
      setHistory(updated);
      saveHistory(updated);
    } catch (e) {
      toast.addToast("error", "Không thể tạo ma trận so sánh");
    } finally {
      setGenerating(false);
    }
  }, [selectedIds, papers, history, toast]);

  const autoTitle = useCallback((paperNames: string[]) => {
    if (paperNames.length === 0) return "Ma trận so sánh";
    const first = paperNames[0];
    const short = first.length > 40 ? first.slice(0, 40) + "..." : first;
    return paperNames.length > 1 ? `${short} +${paperNames.length - 1}` : short;
  }, []);

  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    setSelectedIds(entry.paperIds);
    setMatrix(entry.matrix);
    setExpandedCell(null);
  }, []);

  const deleteHistoryEntry = useCallback((id: string) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
  }, [history]);

  const exportCsv = useCallback(() => {
    if (!matrix) return;
    const headers = matrix.columns.join(",");
    const rows = matrix.rows.map(r => {
      const cells = r.cells.map(c => `"${c.value.replace(/"/g, '""')}"`).join(",");
      return `"${r.criterion}",${cells}`;
    });
    const csv = `${headers}\n${rows.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evidence-matrix.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.addToast("success", "Đã tải CSV");
  }, [matrix, toast]);

  const openPdf = (paperId: string, page: number | null, quote: string) => {
    if (page === null) return;
    setActivePdf({ paperId, page, quote });
  };

  return (
    <div className="evidence-matrix-view" style={{ height: "100%", display: "flex", flexDirection: "column", padding: "20px", overflow: "hidden" }}>
      {/* Header row: title + new button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 700, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <IconBrain size={22} className="icon-gradient" />
            Ma trận so sánh
          </h2>
        </div>
        {matrix && (
          <button
            onClick={() => { setMatrix(null); setExpandedCell(null); }}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid var(--color-border, #333)",
              background: "transparent",
              color: "var(--color-text-muted, #94a3b8)",
              cursor: "pointer",
              fontSize: "0.8rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <IconClose size={14} /> Tạo mới
          </button>
        )}
      </div>

      {!matrix && (
        <>
          {/* Paper Selection */}
          <div className="evidence-paper-selection" style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <IconFileText size={16} />
                <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  Bài báo ({selectedIds.length}/{papers.length})
                </span>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                <button onClick={selectAll} style={chipBtnStyle(selectedIds.length === papers.length && papers.length > 0)}>
                  Chọn tất cả
                </button>
                <button onClick={deselectAll} style={chipBtnStyle(false)}>
                  Bỏ chọn
                </button>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                maxHeight: "100px",
                overflowY: "auto",
                padding: "8px",
                background: "var(--color-surface, #141414)",
                borderRadius: "6px",
                border: "1px solid var(--color-border, #282828)",
              }}
            >
              {papers.length === 0 ? (
                <span style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: "0.8rem", padding: "4px" }}>
                  Chưa có bài báo trong thư viện...
                </span>
              ) : (
                papers.map(p => {
                  const selected = selectedIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePaper(p.id)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "14px",
                        border: selected ? "1px solid var(--color-primary, #6366f1)" : "1px solid var(--color-border, #333)",
                        background: selected ? "rgba(99, 102, 241, 0.1)" : "transparent",
                        color: selected ? "var(--color-primary, #6366f1)" : "var(--color-text-secondary, #a3a3a3)",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                        fontWeight: selected ? 600 : 400,
                        transition: "all 0.15s",
                        whiteSpace: "nowrap",
                        maxWidth: "200px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={p.title}
                    >
                      {p.title.length > 35 ? p.title.slice(0, 35) + "..." : p.title}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Generate Button */}
          <div style={{ marginBottom: "16px" }}>
            <button
              onClick={generateMatrix}
              disabled={generating || selectedIds.length < 2}
              style={{
                padding: "8px 24px",
                borderRadius: "6px",
                border: "none",
                background: generating ? "var(--color-border, #333)" : "var(--color-primary, #6366f1)",
                color: "#fff",
                fontWeight: 600,
                cursor: generating || selectedIds.length < 2 ? "not-allowed" : "pointer",
                fontSize: "0.85rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                opacity: selectedIds.length < 2 ? 0.5 : 1,
              }}
            >
              {generating ? <IconSpinner size={14} /> : <IconSearch size={14} />}
              {generating ? "Đang phân tích..." : "Tạo ma trận so sánh"}
            </button>
          </div>
        </>
      )}

      {/* Matrix Table */}
      {matrix && (
        <div style={{ flex: 1, overflow: "auto", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
            <button onClick={exportCsv} style={{ padding: "4px 12px", borderRadius: "4px", border: "1px solid var(--color-border, #333)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <IconDownload size={12} /> Xuất CSV
            </button>
          </div>
          <table className="evidence-matrix-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={thStyle("Tiêu chí")}>Tiêu chí</th>
                {matrix.columns.map((col, i) => (
                  <th key={i} style={thStyle("primary")}>{col.length > 50 ? col.slice(0, 50) + "..." : col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row, ri) => (
                <tr key={ri}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: "0.8rem", color: "var(--color-text, #e4e4e7)", borderBottom: "1px solid var(--color-border, #282828)", background: "rgba(99, 102, 241, 0.03)", verticalAlign: "top" }}>
                    {row.criterion}
                  </td>
                  {row.cells.map((cell, ci) => {
                    const isExpanded = expandedCell?.row === ri && expandedCell?.col === ci;
                    return (
                      <td key={ci} onClick={() => { if (isExpanded) setExpandedCell(null); else setExpandedCell({ row: ri, col: ci }); }} style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border, #282828)", verticalAlign: "top", cursor: "pointer", background: isExpanded ? "rgba(99, 102, 241, 0.06)" : "transparent", transition: "background 0.15s" }}>
                        <div style={{ marginBottom: "6px", lineHeight: 1.5, color: "var(--color-text, #e4e4e7)" }}>
                          {isExpanded ? cell.value : cell.value.length > 120 ? cell.value.slice(0, 120) + "..." : cell.value}
                        </div>
                        {cell.quote && (
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #94a3b8)", fontStyle: "italic", marginBottom: "4px", padding: "4px 6px", borderLeft: "2px solid var(--color-primary, #6366f1)", background: "rgba(99, 102, 241, 0.04)", borderRadius: "0 4px 4px 0" }}>
                            &ldquo;{cell.quote.length > 100 ? cell.quote.slice(0, 100) + "..." : cell.quote}&rdquo;
                            {cell.page && <span style={{ display: "block", marginTop: "2px", fontSize: "0.7rem" }}>Trang {cell.page}</span>}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          {cell.page && (
                            <button onClick={(e) => { e.stopPropagation(); openPdf(cell.paper_id, cell.page, cell.quote); }} style={{ background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: "4px", color: "var(--color-primary, #6366f1)", cursor: "pointer", padding: "2px 6px", fontSize: "0.68rem", fontWeight: 500 }}>
                              📄 Mở PDF (tr.{cell.page})
                            </button>
                          )}
                          <span style={{ fontSize: "0.65rem", padding: "1px 5px", borderRadius: "3px", fontWeight: 500, background: cell.confidence === "high" ? "rgba(16, 185, 129, 0.1)" : cell.confidence === "medium" ? "rgba(251, 191, 36, 0.1)" : "rgba(239, 68, 68, 0.1)", color: cell.confidence === "high" ? "#10b981" : cell.confidence === "medium" ? "#f59e0b" : "#ef4444" }}>
                            {cell.confidence === "high" ? "✅ Chắc chắn" : cell.confidence === "medium" ? "⚠️ Trung bình" : "❌ Thấp"}
                          </span>
                          <span style={{ fontSize: "0.65rem", padding: "1px 5px", borderRadius: "3px", fontWeight: 500, background: cell.status === "user_verified" ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)", color: cell.status === "user_verified" ? "#10b981" : "#94a3b8" }}>
                            {cell.status === "user_verified" ? "✅ Đã xác nhận" : "🤖 AI trích xuất"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drafts section — luôn hiển thị */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <IconClock size={14} style={{ color: "var(--color-text-muted)" }} />
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-muted, #94a3b8)" }}>
            Bản nháp đã lưu ({history.length})
          </span>
        </div>
        {history.length === 0 ? (
          <div style={{ padding: "12px 0", fontSize: "0.8rem", color: "var(--color-text-muted, #555)", fontStyle: "italic" }}>
            Chưa có bản nháp nào. Tạo ma trận so sánh để bắt đầu.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
            {history.map(entry => (
              <div
                key={entry.id}
                onClick={() => loadFromHistory(entry)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border, #282828)",
                  background: "var(--color-surface, #141414)",
                  cursor: "pointer",
                  transition: "background 0.1s, border-color 0.1s",
                }}
                onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = "var(--color-primary, #6366f1)"; el.style.background = "rgba(99, 102, 241, 0.04)"; }}
                onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = "var(--color-border, #282828)"; el.style.background = "var(--color-surface, #141414)"; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--color-text, #e4e4e7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {entry.title || entry.paperNames.join(" • ")}
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "4px", fontSize: "0.75rem", color: "var(--color-text-muted, #94a3b8)" }}>
                    <span>{entry.paperNames.length} bài báo</span>
                    <span>{entry.matrix.rows.length} tiêu chí</span>
                    <span>{formatDate(entry.timestamp)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteHistoryEntry(entry.id); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-text-muted, #555)",
                    cursor: "pointer",
                    padding: "4px",
                    fontSize: "0.9rem",
                    lineHeight: 1,
                    flexShrink: 0,
                    borderRadius: "4px",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  title="Xóa"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PDF Quick View */}
      {activePdf && (
        <div className="evidence-pdf-overlay" onClick={() => setActivePdf(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "80%", height: "85%", background: "var(--color-surface, #141414)", borderRadius: "8px", border: "1px solid var(--color-border, #282828)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border, #282828)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                PDF — Trang {activePdf.page}
                {activePdf.quote && <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: "8px", fontSize: "0.78rem" }}>&ldquo;{activePdf.quote.slice(0, 60)}...&rdquo;</span>}
              </span>
              <button onClick={() => setActivePdf(null)} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
            </div>
            <iframe src={`${BASE_URL}/api/papers/${activePdf.paperId}/file#page=${activePdf.page}`} style={{ flex: 1, border: "none" }} title="PDF Preview" />
          </div>
        </div>
      )}
    </div>
  );
};

const thStyle = (type: "Tiêu chí" | "primary") => ({
  padding: "8px 12px",
  textAlign: "left" as const,
  fontWeight: 600,
  fontSize: "0.78rem",
  color: type === "Tiêu chí" ? "var(--color-text-muted, #94a3b8)" : "var(--color-primary, #6366f1)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  borderBottom: "2px solid var(--color-primary, #6366f1)",
  position: "sticky" as const,
  top: 0,
  background: "var(--color-bg, #0a0a0a)",
  zIndex: 1,
  minWidth: type === "Tiêu chí" ? "120px" : "200px",
});

const chipBtnStyle = (isActive: boolean) => ({
  padding: "3px 10px",
  borderRadius: "4px",
  border: "1px solid var(--color-border, #333)",
  background: isActive ? "rgba(99, 102, 241, 0.1)" : "transparent",
  color: isActive ? "var(--color-primary, #6366f1)" : "var(--color-text-muted, #94a3b8)",
  cursor: "pointer",
  fontSize: "0.75rem",
  fontWeight: isActive ? 600 : 400,
  transition: "all 0.15s",
});
