import React, { useState, useCallback } from "react";
import { api, BASE_URL } from "../../lib/api";
import { useToast } from "../shared/Toast";
import { IconSpinner, IconFileText, IconDownload, IconSearch, IconBrain } from "../Icons";

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

export const EvidenceMatrixView: React.FC = () => {
  const [papers, setPapers] = useState<{ id: string; title: string; authors: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [matrix, setMatrix] = useState<EvidenceMatrix | null>(null);
  const [expandedCell, setExpandedCell] = useState<{ row: number; col: number } | null>(null);
  const [activePdf, setActivePdf] = useState<{ paperId: string; page: number; quote: string } | null>(null);
  const toast = useToast();

  React.useEffect(() => {
    api.listPapers(1, 100).then(data => {
      setPapers(data.papers.map(p => ({ id: p.id, title: p.title || p.filename, authors: p.authors || "" })));
    }).catch(() => {});
  }, []);

  const togglePaper = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const generateMatrix = useCallback(async () => {
    if (selectedIds.length < 2) {
      toast.addToast("error", "Chọn ít nhất 2 paper để so sánh");
      return;
    }
    setGenerating(true);
    setMatrix(null);
    try {
      const res = await api.generateEvidenceMatrix(selectedIds);
      setMatrix(res.matrix);
    } catch (e) {
      toast.addToast("error", "Không thể tạo bảng bằng chứng");
    } finally {
      setGenerating(false);
    }
  }, [selectedIds, toast]);

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
    <div className="evidence-matrix-view" style={{ height: "100%", display: "flex", flexDirection: "column", padding: "20px" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontWeight: 700, fontSize: "1.2rem" }}>
          <IconBrain size={22} className="icon-gradient" />
          Evidence Matrix
        </h2>
        <p style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: "0.85rem", margin: "6px 0 0 0" }}>
          So sánh phương pháp, dữ liệu, kết quả và hạn chế giữa các paper — mỗi ô kèm trích dẫn gốc
        </p>
      </div>

      {/* Paper Selection */}
      <div className="evidence-paper-selection" style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <IconFileText size={16} />
          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
            Chọn paper để so sánh ({selectedIds.length}/{papers.length})
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            maxHeight: "120px",
            overflowY: "auto",
            padding: "8px",
            background: "var(--color-surface, #141414)",
            borderRadius: "6px",
            border: "1px solid var(--color-border, #282828)",
          }}
        >
          {papers.length === 0 ? (
            <span style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: "0.8rem", padding: "4px" }}>
              Chưa có paper trong thư viện...
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
            padding: "8px 20px",
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
          {generating ? "Đang phân tích..." : `Tạo Evidence Matrix (${selectedIds.length} papers)`}
        </button>
      </div>

      {/* Matrix Table */}
      {matrix && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
            <button
              onClick={exportCsv}
              style={{
                padding: "4px 12px",
                borderRadius: "4px",
                border: "1px solid var(--color-border, #333)",
                background: "transparent",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                fontSize: "0.78rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <IconDownload size={12} /> Export CSV
            </button>
          </div>

          <table
            className="evidence-matrix-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.82rem",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: "0.78rem",
                    color: "var(--color-text-muted, #94a3b8)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    borderBottom: "2px solid var(--color-primary, #6366f1)",
                    position: "sticky",
                    top: 0,
                    background: "var(--color-bg, #0a0a0a)",
                    zIndex: 1,
                    minWidth: "120px",
                  }}
                >
                  Tiêu chí
                </th>
                {matrix.columns.map((col, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontWeight: 600,
                      fontSize: "0.78rem",
                      color: "var(--color-primary, #6366f1)",
                      borderBottom: "2px solid var(--color-primary, #6366f1)",
                      position: "sticky",
                      top: 0,
                      background: "var(--color-bg, #0a0a0a)",
                      zIndex: 1,
                      minWidth: "200px",
                    }}
                  >
                    {col.length > 50 ? col.slice(0, 50) + "..." : col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row, ri) => (
                <tr key={ri}>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                      color: "var(--color-text, #e4e4e7)",
                      borderBottom: "1px solid var(--color-border, #282828)",
                      background: "rgba(99, 102, 241, 0.03)",
                      verticalAlign: "top",
                    }}
                  >
                    {row.criterion}
                  </td>
                  {row.cells.map((cell, ci) => {
                    const isExpanded = expandedCell?.row === ri && expandedCell?.col === ci;
                    return (
                      <td
                        key={ci}
                        onClick={() => {
                          if (isExpanded) setExpandedCell(null);
                          else setExpandedCell({ row: ri, col: ci });
                        }}
                        style={{
                          padding: "10px 12px",
                          borderBottom: "1px solid var(--color-border, #282828)",
                          verticalAlign: "top",
                          cursor: "pointer",
                          background: isExpanded ? "rgba(99, 102, 241, 0.06)" : "transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        <div style={{ marginBottom: "6px", lineHeight: 1.5, color: "var(--color-text, #e4e4e7)" }}>
                          {isExpanded
                            ? cell.value
                            : cell.value.length > 120
                              ? cell.value.slice(0, 120) + "..."
                              : cell.value
                          }
                        </div>

                        {/* Quote + Page + Open PDF */}
                        {cell.quote && (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--color-text-muted, #94a3b8)",
                              fontStyle: "italic",
                              marginBottom: "4px",
                              padding: "4px 6px",
                              borderLeft: "2px solid var(--color-primary, #6366f1)",
                              background: "rgba(99, 102, 241, 0.04)",
                              borderRadius: "0 4px 4px 0",
                            }}
                          >
                            &ldquo;{cell.quote.length > 100 ? cell.quote.slice(0, 100) + "..." : cell.quote}&rdquo;
                            {cell.page && (
                              <span style={{ display: "block", marginTop: "2px", fontSize: "0.7rem" }}>
                                Trang {cell.page}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Actions row */}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          {cell.page && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openPdf(cell.paper_id, cell.page, cell.quote);
                              }}
                              style={{
                                background: "rgba(99, 102, 241, 0.08)",
                                border: "1px solid rgba(99, 102, 241, 0.2)",
                                borderRadius: "4px",
                                color: "var(--color-primary, #6366f1)",
                                cursor: "pointer",
                                padding: "2px 6px",
                                fontSize: "0.68rem",
                                fontWeight: 500,
                              }}
                            >
                              📄 Mở PDF (tr.{cell.page})
                            </button>
                          )}

                          <span
                            style={{
                              fontSize: "0.65rem",
                              padding: "1px 5px",
                              borderRadius: "3px",
                              fontWeight: 500,
                              background:
                                cell.confidence === "high"
                                  ? "rgba(16, 185, 129, 0.1)"
                                  : cell.confidence === "medium"
                                    ? "rgba(251, 191, 36, 0.1)"
                                    : "rgba(239, 68, 68, 0.1)",
                              color:
                                cell.confidence === "high"
                                  ? "#10b981"
                                  : cell.confidence === "medium"
                                    ? "#f59e0b"
                                    : "#ef4444",
                            }}
                          >
                            {cell.confidence === "high" ? "✅ Chắc chắn" : cell.confidence === "medium" ? "⚠️ Trung bình" : "❌ Thấp"}
                          </span>

                          <span
                            style={{
                              fontSize: "0.65rem",
                              padding: "1px 5px",
                              borderRadius: "3px",
                              fontWeight: 500,
                              background: cell.status === "user_verified"
                                ? "rgba(16, 185, 129, 0.1)"
                                : "rgba(148, 163, 184, 0.1)",
                              color: cell.status === "user_verified" ? "#10b981" : "#94a3b8",
                            }}
                          >
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

      {/* Empty state */}
      {!matrix && !generating && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-muted, #94a3b8)",
            gap: "12px",
          }}
        >
          <IconBrain size={48} className="icon-gradient" style={{ opacity: 0.4 }} />
          <p style={{ fontSize: "0.9rem", textAlign: "center", maxWidth: "400px" }}>
            Chọn ít nhất 2 paper và nhấn "Tạo Evidence Matrix" để so sánh phương pháp, dữ liệu, kết quả và hạn chế — mỗi ô đều kèm trích dẫn gốc và số trang.
          </p>
        </div>
      )}

      {/* PDF Quick View */}
      {activePdf && (
        <div
          className="evidence-pdf-overlay"
          onClick={() => setActivePdf(null)}
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "80%",
              height: "85%",
              background: "var(--color-surface, #141414)",
              borderRadius: "8px",
              border: "1px solid var(--color-border, #282828)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--color-border, #282828)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                PDF — Trang {activePdf.page}
                {activePdf.quote && (
                  <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: "8px", fontSize: "0.78rem" }}>
                    &ldquo;{activePdf.quote.slice(0, 60)}...&rdquo;
                  </span>
                )}
              </span>
              <button
                onClick={() => setActivePdf(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                }}
              >
                ✕
              </button>
            </div>
            <iframe
              src={`${BASE_URL}/api/papers/${activePdf.paperId}/file#page=${activePdf.page}`}
              style={{ flex: 1, border: "none" }}
              title="PDF Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
};
