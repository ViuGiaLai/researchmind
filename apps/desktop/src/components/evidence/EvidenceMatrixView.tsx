import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api, getAuthenticatedApiUrl, EvidenceMatrixDraftSummary } from "../../lib/api";
import { useToast } from "../shared/Toast";
import { IconSpinner, IconFileText, IconDownload, IconSearch, IconBrain, IconClock, IconClose, IconCheck, IconWarning, IconError, IconBot, IconWithText, IconRefresh, IconTrash, IconEdit } from "../Icons";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { usePromptDialog } from "../shared/ConfirmDialog";

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
  paperIds: string[];
  paperNames: string[];
  matrix: EvidenceMatrix;
  criterionCount?: number;
  updated_at: string | null;
  created_at: string | null;
}

function formatServerDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " +
    d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

const CONFIDENCE_BADGE: Record<EvidenceCell["confidence"], string> = {
  high: "rm-badge--success",
  medium: "rm-badge--warning",
  low: "rm-badge--error",
};

const CONFIDENCE_ICON: Record<EvidenceCell["confidence"], React.FC<{ size?: number }>> = {
  high: IconCheck,
  medium: IconWarning,
  low: IconError,
};

interface EvidenceMatrixViewProps {
  projectId?: string;
  initialPaperIds?: string[];
}

export const EvidenceMatrixView: React.FC<EvidenceMatrixViewProps> = ({ projectId, initialPaperIds = [] }) => {
  const { t } = useTranslation();
  const { prompt, promptDialog } = usePromptDialog();
  const [papers, setPapers] = useState<{ id: string; title: string; authors: string; thumbnail_url?: string; auto_summary?: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [matrix, setMatrix] = useState<EvidenceMatrix | null>(null);
  const [expandedCell, setExpandedCell] = useState<{ row: number; col: number } | null>(null);
  const [activePdf, setActivePdf] = useState<{ paperId: string; page: number; quote: string } | null>(null);
  const pdfDialogRef = useDialogFocus<HTMLDivElement>(Boolean(activePdf), () => setActivePdf(null));
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const toast = useToast();

  useEffect(() => {
    const source = projectId ? api.getProject(projectId).then(data => data.papers) : api.listPapers(1, 100).then(data => data.papers);
    source.then((sourcePapers: any[]) => {
      const next = sourcePapers.map(p => ({
        id: p.id,
        title: p.title || "",
        authors: Array.isArray(p.authors) ? p.authors.join(", ") : (p.authors || ""),
        thumbnail_url: (p as any).thumbnail_url,
        auto_summary: (p as any).auto_summary,
      }));
      setPapers(next);
      const available = new Set(next.map(p => p.id));
      setSelectedIds(initialPaperIds.filter(id => available.has(id)));
    }).catch(() => {});
    loadDraftList();
  }, [projectId, initialPaperIds.join("|")]);

  const loadDraftList = async () => {
    try {
      const res = await api.listEvidenceMatrixDrafts();
      const entries: HistoryEntry[] = res.drafts.map((d: EvidenceMatrixDraftSummary) => ({
        id: d.id,
        title: d.title,
        paperIds: [],
        paperNames: d.paper_names,
        matrix: { columns: [], rows: [] },
        criterionCount: d.criterion_count,
        updated_at: d.updated_at,
        created_at: d.created_at,
      }));
      setHistory(entries);
    } catch {
      // silently fail
    }
  };

  const loadFullDraft = async (draftId: string) => {
    try {
      const data = await api.loadEvidenceMatrixDraft(draftId);
      if (data.error) {
        toast.addToast("error", data.error);
        return;
      }
      setSelectedIds(data.paper_ids);
      setMatrix({
        columns: data.columns,
        rows: data.rows.map((r) => ({
          criterion: r.criterion,
          cells: r.cells.map((c) => ({
            paper_id: c.paper_id,
            paper_title: c.paper_title,
            value: c.value,
            quote: c.quote,
            page: c.page,
            confidence: c.confidence,
            status: c.status,
          })),
        })),
      });
      setExpandedCell(null);
    } catch {
      toast.addToast("error", t("evidence.toast_load_error"));
    }
  };

  const selectAll = () => setSelectedIds(papers.map(p => p.id));
  const deselectAll = () => setSelectedIds([]);

  const togglePaper = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const autoTitle = useCallback((paperNames: string[]) => {
    if (paperNames.length === 0) return t("evidence.title");
    const first = paperNames[0];
    const short = first.length > 40 ? first.slice(0, 40) + "..." : first;
    return paperNames.length > 1 ? `${short} +${paperNames.length - 1}` : short;
  }, []);

  const generateMatrix = useCallback(async () => {
    if (selectedIds.length < 2) {
      toast.addToast("error", t("evidence.select_min"));
      return;
    }
    setGenerating(true);
    try {
      const res = await api.generateEvidenceMatrix(selectedIds, false);
      const m = res.matrix;
      setMatrix(m);

      const paperNames = selectedIds
        .map(id => papers.find(p => p.id === id)?.title || id)
        .map(t => t.length > 30 ? t.slice(0, 30) + "..." : t);

      const title = autoTitle(paperNames);

      const saveRes = await api.saveEvidenceMatrixDraft({
        title,
        paper_ids: selectedIds,
        paper_names: paperNames,
        columns: m.columns,
        rows: m.rows.map((r) => ({
          criterion: r.criterion,
          cells: r.cells,
        })),
      });

      if (saveRes.id) {
        await loadDraftList();
      }
    } catch {
      toast.addToast("error", t("evidence.toast_create_error"));
    } finally {
      setGenerating(false);
    }
  }, [selectedIds, papers, toast, autoTitle, t]);

  const renameHistoryEntry = useCallback(async (id: string) => {
    const entry = history.find((item) => item.id === id);
    if (!entry) return;
    const nextTitle = await prompt({
      title: t("common.rename"),
      message: t("evidence.rename_prompt"),
      initialValue: entry.title,
    });
    if (!nextTitle || nextTitle === entry.title) return;
    try {
      await api.renameEvidenceMatrixDraft(id, nextTitle);
      setHistory((prev) => prev.map((item) => (item.id === id ? { ...item, title: nextTitle } : item)));
      toast.addToast("success", t("evidence.toast_rename_success"));
    } catch {
      toast.addToast("error", t("evidence.toast_rename_error"));
    }
  }, [history, prompt, toast, t]);

  const deleteHistoryEntry = useCallback(async (id: string) => {
    try {
      await api.deleteEvidenceMatrixDraft(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
      toast.addToast("success", t("evidence.toast_delete_success"));
    } catch {
      toast.addToast("error", t("evidence.toast_delete_error"));
    }
  }, [toast, t]);

  const exportExcel = useCallback(() => {
    if (!matrix) return;

    // Generate styled HTML string for Excel
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">`;
    html += `<head><meta charset="utf-8"/>`;
    html += `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Bảng đối chiếu bằng chứng</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->`;
    html += `<style>`;
    html += `table { border-collapse: collapse; margin: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }`;
    html += `th { background-color: #10b981; color: #ffffff; font-weight: bold; border: 1px solid #059669; padding: 12px 16px; text-align: left; font-size: 14px; }`;
    html += `td { border: 1px solid #e2e8f0; padding: 12px 16px; vertical-align: top; font-size: 13px; color: #1e293b; line-height: 1.5; }`;
    html += `.criterion-cell { background-color: #f8fafc; font-weight: bold; color: #0f172a; border-right: 2px solid #10b981; }`;
    html += `.quote-box { font-style: italic; color: #475569; background-color: #f1f5f9; border-left: 3px solid #10b981; padding: 8px; margin-top: 6px; border-radius: 4px; }`;
    html += `.meta-line { font-size: 11px; color: #64748b; margin-top: 6px; }`;
    html += `.confidence-high { color: #10b981; font-weight: bold; }`;
    html += `.confidence-medium { color: #d97706; font-weight: bold; }`;
    html += `.confidence-low { color: #dc2626; font-weight: bold; }`;
    html += `</style></head><body>`;
    html += `<table><thead><tr>`;
    html += `<th>Tiêu chí đối chiếu</th>`;
    matrix.columns.forEach(col => {
      html += `<th>${col}</th>`;
    });
    html += `</tr></thead><tbody>`;
    
    matrix.rows.forEach(row => {
      html += `<tr>`;
      html += `<td class="criterion-cell">${row.criterion}</td>`;
      row.cells.forEach(cell => {
        const confClass = `confidence-${cell.confidence}`;
        const confText = cell.confidence === "high" ? "Độ tin cậy cao" : cell.confidence === "medium" ? "Độ tin cậy trung bình" : "Độ tin cậy thấp";
        
        let cellHtml = `<div>${cell.value}</div>`;
        if (cell.quote) {
          cellHtml += `<div class="quote-box">&ldquo;${cell.quote}&rdquo;</div>`;
        }
        cellHtml += `<div class="meta-line">`;
        cellHtml += `<span class="${confClass}">● ${confText}</span>`;
        if (cell.page) {
          cellHtml += ` &middot; Trang ${cell.page}`;
        }
        cellHtml += ` &middot; ${cell.status === "user_verified" ? "Đã xác nhận" : "AI trích xuất"}`;
        cellHtml += `</div>`;
        
        html += `<td>${cellHtml}</td>`;
      });
      html += `</tr>`;
    });
    
    html += `</tbody></table></body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evidence-matrix.xls";
    a.click();
    URL.revokeObjectURL(url);
    toast.addToast("success", t("evidence.toast_excel_success") || "Xuất file Excel thành công!");
  }, [matrix, toast, t]);

  const openPdf = (paperId: string, page: number | null, quote: string) => {
    if (page === null) return;
    setActivePdf({ paperId, page, quote });
  };

  const filteredPapers = papers.filter(p =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.authors.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="evidence-layout-container">
      {matrix ? (
        <div className="rm-page evidence-matrix-view">
          <div className="rm-page-actions">
            <div className="rm-page-header" style={{ marginBottom: 0 }}>
              <h2>
                <IconBrain size={22} className="icon-gradient" />
                {t("evidence.title")}
              </h2>
              <p className="rm-page-subtitle" style={{ margin: "6px 0 0", color: "var(--color-text-secondary)", fontSize: "0.86rem" }}>
                {t("evidence.description")}
              </p>
            </div>
            <div className="u-row-gap8">
              <button
                type="button"
                className="rm-btn rm-btn--sm rm-btn--outline"
                onClick={() => { setMatrix(null); setExpandedCell(null); }}
              >
                <IconClose size={14} /> {t("evidence.new_matrix")}
              </button>
              <button
                type="button"
                className="rm-btn rm-btn--sm rm-btn--primary"
                onClick={generateMatrix}
                disabled={generating}
              >
                {generating ? <IconSpinner size={14} /> : <IconRefresh size={14} />}
                {generating ? t("evidence.regenerating") : t("evidence.regenerate")}
              </button>
            </div>
          </div>

          <div className="rm-table-wrap u-mt-16">
            <div className="u-row u-mb-12" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="rm-btn rm-btn--xs rm-btn--outline" onClick={exportExcel}>
                <IconDownload size={12} /> {t("evidence.export_excel") || "Xuất Excel"}
              </button>
            </div>
            <table className="rm-table evidence-matrix-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>{t("evidence.criteria_header")}</th>
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
                              {cell.page && <span style={{ display: "block", marginTop: 2, fontSize: "0.7rem" }}>{t("evidence.page_label", { n: cell.page })}</span>}
                            </div>
                          )}
                          <div className="u-row-gap6 u-row-wrap u-mt-4">
                            {cell.page && (
                              <button
                                type="button"
                                className="rm-btn rm-btn--xs"
                                onClick={(e) => { e.stopPropagation(); openPdf(cell.paper_id, cell.page, cell.quote); }}
                              >
                                <IconWithText icon={IconFileText} size={12}>
                                  {t("evidence.open_pdf_page", { n: cell.page })}
                                </IconWithText>
                              </button>
                            )}
                            <span className={`rm-badge ${CONFIDENCE_BADGE[cell.confidence]}`}>
                              <IconWithText icon={CONFIDENCE_ICON[cell.confidence]} size={12}>
                                {t(`evidence.confidence_${cell.confidence}`)}
                              </IconWithText>
                            </span>
                            <span className={`rm-badge ${cell.status === "user_verified" ? "rm-badge--success" : "rm-badge--muted"}`}>
                              {cell.status === "user_verified" ? (
                                <IconWithText icon={IconCheck} size={12}>{t("evidence.confirmed_badge")}</IconWithText>
                              ) : (
                                <IconWithText icon={IconBot} size={12}>{t("evidence.ai_extracted_badge")}</IconWithText>
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
        </div>
      ) : (
        <div className="evidence-setup-layout">
          <div className="evidence-setup-main">
            <div className="evidence-header-box">
              <div className="evidence-icon-wrapper">
                <IconBrain size={24} />
              </div>
              <div className="evidence-header-text">
                <h2>{t("evidence.title") || "Ma trận so sánh"}</h2>
                <p>{t("evidence.description") || "So sánh bằng chứng theo từng paper để xác minh claim, quote và mức độ tin cậy."}</p>
              </div>
            </div>

            <div className="evidence-controls-row">
              <div className="evidence-search-wrapper">
                <IconSearch size={16} className="evidence-search-icon" />
                <input
                  type="text"
                  className="evidence-search-input"
                  placeholder="Tìm kiếm tài liệu..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="evidence-actions-group">
                <button type="button" className="rm-btn rm-btn--xs rm-btn--chip" onClick={selectAll}>
                  {t("evidence.select_all") || "Chọn tất cả"}
                </button>
                <button type="button" className="rm-btn rm-btn--xs rm-btn--chip" onClick={deselectAll}>
                  {t("evidence.deselect") || "Bỏ chọn"}
                </button>
              </div>
            </div>

            <div className="evidence-paper-list-container">
              {filteredPapers.length === 0 ? (
                <div className="rm-section-hint u-text-center" style={{ padding: "40px 0" }}>
                  {t("evidence.empty_library") || "Thư viện trống hoặc không tìm thấy tài liệu phù hợp"}
                </div>
              ) : (
                filteredPapers.map(p => {
                  const isSelected = selectedIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`evidence-paper-row${isSelected ? " selected" : ""}`}
                      onClick={() => togglePaper(p.id)}
                    >
                      <div className="evidence-row-checkbox">
                        {isSelected && <IconCheck size={14} />}
                      </div>
                      <div className="evidence-paper-thumb">
                        {p.thumbnail_url ? (
                          <img src={p.thumbnail_url} alt="" loading="lazy" />
                        ) : (
                          <IconFileText size={28} />
                        )}
                      </div>
                      <div className="evidence-paper-row-content">
                        <div className="evidence-paper-row-title-row">
                          <h3 className="evidence-paper-row-title" title={p.title}>{p.title}</h3>
                          <button
                            type="button"
                            className="evidence-paper-pdf-btn"
                            onClick={(e) => { e.stopPropagation(); openPdf(p.id, 1, ""); }}
                            title="Open PDF"
                          >
                            <IconFileText size={14} />
                          </button>
                        </div>
                        <div className="evidence-paper-row-meta">
                          {p.authors || t("common.unknown_author")}
                        </div>
                        {p.auto_summary && (
                          <div className="evidence-paper-row-abstract">{p.auto_summary.replace(/^#{1,6}\s+|^>\s+|[*_]{2,}|`{1,3}/gm, '').trim()}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="evidence-setup-sidebar">
            <div className="evidence-sidebar-btn-wrapper">
              <button
                type="button"
                className="evidence-create-matrix-btn"
                onClick={generateMatrix}
                disabled={generating || selectedIds.length < 2}
              >
                {generating ? <IconSpinner size={16} /> : <IconBrain size={16} />}
                <span>{generating ? t("evidence.analyzing") : (t("evidence.create_matrix") || "Tạo ma trận so sánh")}</span>
              </button>
            </div>

            <div className="evidence-drafts-header">
              <span className="evidence-drafts-title">
                {t("evidence.drafts_label", { n: history.length }).replace(/\(\d+\)/, "") || "BẢN NHÁP GẦN ĐÂY"}
              </span>
            </div>

            <div className="evidence-sidebar-drafts-list">
              {history.length === 0 ? (
                <div className="rm-section-hint u-text-xs u-text-center" style={{ padding: "20px 0" }}>
                  {t("evidence.no_drafts") || "Không có bản nháp nào"}
                </div>
              ) : (
                history.map(entry => (
                  <div key={entry.id} className="evidence-sidebar-draft-card">
                    <div className="evidence-draft-card-header">
                      <h4 className="evidence-draft-card-title">{entry.title || entry.paperNames.join(" • ")}</h4>
                    </div>
                    <div className="evidence-draft-card-meta">
                      <span>
                        <IconFileText size={11} /> {entry.paperNames.length} papers
                      </span>
                      {entry.criterionCount !== undefined && (
                        <span>
                          <IconBrain size={11} /> {entry.criterionCount} criteria
                        </span>
                      )}
                    </div>
                    <div className="evidence-draft-card-meta">
                      <span><IconClock size={11} /> {formatServerDate(entry.updated_at)}</span>
                    </div>
                    <div className="evidence-draft-card-actions">
                      <div className="evidence-draft-card-action-btns">
                        <button
                          type="button"
                          className="evidence-draft-card-icon-btn"
                          onClick={(e) => { e.stopPropagation(); renameHistoryEntry(entry.id); }}
                          title={t("evidence.rename_btn")}
                        >
                          <IconEdit size={12} />
                        </button>
                        <button
                          type="button"
                          className="evidence-draft-card-icon-btn"
                          onClick={(e) => { e.stopPropagation(); deleteHistoryEntry(entry.id); }}
                          title={t("evidence.delete_btn")}
                        >
                          <IconTrash size={12} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="evidence-draft-card-continue-btn"
                        onClick={() => loadFullDraft(entry.id)}
                      >
                        <span>{t("evidence.continue_btn") || "Tiếp tục"}</span>
                        <span>&rarr;</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activePdf && (
        <div className="rm-overlay evidence-pdf-overlay" onClick={() => setActivePdf(null)}>
          <div ref={pdfDialogRef} className="rm-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-pdf-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="rm-modal-header">
              <span id="evidence-pdf-title" className="rm-modal-title">
                {t("evidence.pdf_modal", { n: activePdf.page })}
                {activePdf.quote && (
                  <span className="u-text-secondary u-text-sm u-ml-8">
                    &ldquo;{activePdf.quote.slice(0, 60)}...&rdquo;
                  </span>
                )}
              </span>
              <button type="button" className="rm-modal-close" aria-label={t("common.close")} onClick={() => setActivePdf(null)}>✕</button>
            </div>
            <iframe
              src={getAuthenticatedApiUrl(`/api/papers/${activePdf.paperId}/file#page=${activePdf.page}`)}
              style={{ flex: 1, border: "none" }}
              title={t("pdf.preview_title")}
            />
          </div>
        </div>
      )}
      {promptDialog}
    </div>
  );
};
