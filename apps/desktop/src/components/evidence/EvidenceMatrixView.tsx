import React, { useState, useCallback, useEffect } from "react";
import { api, BASE_URL } from "../../lib/api";
import { useToast } from "../shared/Toast";
import { IconSpinner, IconFileText, IconDownload, IconSearch, IconBrain, IconClock, IconClose, IconCheck, IconWarning, IconError, IconBot, IconWithText } from "../Icons";

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

const CONFIDENCE_BADGE: Record<EvidenceCell["confidence"], string> = {
  high: "rm-badge--success",
  medium: "rm-badge--warning",
  low: "rm-badge--error",
};

const CONFIDENCE_LABEL: Record<EvidenceCell["confidence"], { icon: React.FC<{ size?: number }>; text: string }> = {
  high: { icon: IconCheck, text: "Chắc chắn" },
  medium: { icon: IconWarning, text: "Trung bình" },
  low: { icon: IconError, text: "Thấp" },
};

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

  const selectAll = () => setSelectedIds(papers.map(p => p.id));
  const deselectAll = () => setSelectedIds([]);

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
    } catch {
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

  const allSelected = selectedIds.length === papers.length && papers.length > 0;

  return (
    <div className="rm-page evidence-matrix-view">
      <div className="rm-page-actions">
        <div className="rm-page-header" style={{ marginBottom: 0 }}>
          <h2>
            <IconBrain size={22} className="icon-gradient" />
            Ma trận so sánh
          </h2>
        </div>
        {matrix && (
          <button
            type="button"
            className="rm-btn rm-btn--sm"
            onClick={() => { setMatrix(null); setExpandedCell(null); }}
          >
            <IconClose size={14} /> Tạo mới
          </button>
        )}
      </div>

      {!matrix && (
        <>
          <div className="evidence-paper-selection" style={{ marginBottom: 12 }}>
            <div className="rm-page-actions">
              <div className="rm-section-label" style={{ marginBottom: 0 }}>
                <IconFileText size={16} />
                <span>Bài báo ({selectedIds.length}/{papers.length})</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" className={`rm-btn rm-btn--xs rm-btn--chip${allSelected ? " active" : ""}`} onClick={selectAll}>
                  Chọn tất cả
                </button>
                <button type="button" className="rm-btn rm-btn--xs rm-btn--chip" onClick={deselectAll}>
                  Bỏ chọn
                </button>
              </div>
            </div>
            <div className="rm-chip-group">
              {papers.length === 0 ? (
                <span className="rm-card-meta" style={{ padding: 4 }}>Chưa có bài báo trong thư viện...</span>
              ) : (
                papers.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`rm-chip${selectedIds.includes(p.id) ? " selected" : ""}`}
                    onClick={() => togglePaper(p.id)}
                    title={p.title}
                  >
                    {p.title.length > 35 ? p.title.slice(0, 35) + "..." : p.title}
                  </button>
                ))
              )}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="rm-btn rm-btn--primary"
              onClick={generateMatrix}
              disabled={generating || selectedIds.length < 2}
            >
              {generating ? <IconSpinner size={14} /> : <IconSearch size={14} />}
              {generating ? "Đang phân tích..." : "Tạo ma trận so sánh"}
            </button>
          </div>
        </>
      )}

      {matrix && (
        <div className="rm-table-wrap">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button type="button" className="rm-btn rm-btn--xs" onClick={exportCsv}>
              <IconDownload size={12} /> Xuất CSV
            </button>
          </div>
          <table className="rm-table evidence-matrix-table">
            <thead>
              <tr>
                <th style={{ minWidth: 120 }}>Tiêu chí</th>
                {matrix.columns.map((col, i) => (
                  <th key={i} className="rm-table-th--primary" style={{ minWidth: 200 }}>
                    {col.length > 50 ? col.slice(0, 50) + "..." : col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row, ri) => (
                <tr key={ri}>
                  <td className="rm-table-td--criterion">{row.criterion}</td>
                  {row.cells.map((cell, ci) => {
                    const isExpanded = expandedCell?.row === ri && expandedCell?.col === ci;
                    return (
                      <td
                        key={ci}
                        className={`rm-table-td--clickable${isExpanded ? " rm-table-td--expanded" : ""}`}
                        onClick={() => setExpandedCell(isExpanded ? null : { row: ri, col: ci })}
                      >
                        <div style={{ marginBottom: 6 }}>
                          {isExpanded ? cell.value : cell.value.length > 120 ? cell.value.slice(0, 120) + "..." : cell.value}
                        </div>
                        {cell.quote && (
                          <div className="rm-quote">
                            &ldquo;{cell.quote.length > 100 ? cell.quote.slice(0, 100) + "..." : cell.quote}&rdquo;
                            {cell.page && <span style={{ display: "block", marginTop: 2, fontSize: "0.7rem" }}>Trang {cell.page}</span>}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                          {cell.page && (
                            <button
                              type="button"
                              className="rm-btn rm-btn--xs"
                              onClick={(e) => { e.stopPropagation(); openPdf(cell.paper_id, cell.page, cell.quote); }}
                            >
                              <IconWithText icon={IconFileText} size={12}>
                                Mở PDF (tr.{cell.page})
                              </IconWithText>
                            </button>
                          )}
                          <span className={`rm-badge ${CONFIDENCE_BADGE[cell.confidence]}`}>
                            <IconWithText icon={CONFIDENCE_LABEL[cell.confidence].icon} size={12}>
                              {CONFIDENCE_LABEL[cell.confidence].text}
                            </IconWithText>
                          </span>
                          <span className={`rm-badge ${cell.status === "user_verified" ? "rm-badge--success" : "rm-badge--muted"}`}>
                            {cell.status === "user_verified" ? (
                              <IconWithText icon={IconCheck} size={12}>Đã xác nhận</IconWithText>
                            ) : (
                              <IconWithText icon={IconBot} size={12}>AI trích xuất</IconWithText>
                            )}
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

      <div style={{ flexShrink: 0 }}>
        <div className="rm-section-label">
          <IconClock size={14} />
          <span>Bản nháp đã lưu ({history.length})</span>
        </div>
        {history.length === 0 ? (
          <div className="rm-section-hint">Chưa có bản nháp nào. Tạo ma trận so sánh để bắt đầu.</div>
        ) : (
          <div className="rm-history-list">
            {history.map(entry => (
              <div key={entry.id} className="rm-history-item" onClick={() => loadFromHistory(entry)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rm-history-item-title">
                    {entry.title || entry.paperNames.join(" • ")}
                  </div>
                  <div className="rm-history-item-meta">
                    <span>{entry.paperNames.length} bài báo</span>
                    <span>{entry.matrix.rows.length} tiêu chí</span>
                    <span>{formatDate(entry.timestamp)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="rm-history-delete"
                  onClick={(e) => { e.stopPropagation(); deleteHistoryEntry(entry.id); }}
                  title="Xóa"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {activePdf && (
        <div className="rm-overlay evidence-pdf-overlay" onClick={() => setActivePdf(null)}>
          <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rm-modal-header">
              <span className="rm-modal-title">
                PDF — Trang {activePdf.page}
                {activePdf.quote && (
                  <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 8, fontSize: "0.78rem" }}>
                    &ldquo;{activePdf.quote.slice(0, 60)}...&rdquo;
                  </span>
                )}
              </span>
              <button type="button" className="rm-modal-close" onClick={() => setActivePdf(null)}>✕</button>
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
