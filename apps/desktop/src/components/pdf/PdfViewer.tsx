import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getAuthenticatedApiUrl, type PdfAnnotation } from "../../lib/api";
import {
  IconBookmark,
  IconCheck,
  IconClipboard,
  IconClose,
  IconDownload,
  IconEdit,
  IconFileText,
  IconSpinner,
  IconTrash,
  IconWithText,
} from "../Icons";

interface HighlightItem {
  page: number;
  text: string;
  _paperId?: string;
}

interface PdfViewerProps {
  paperId: string;
  paperTitle: string;
  initialPage?: number;
  totalPages?: number | null;
  highlightText?: string;
  highlights?: HighlightItem[];
  mode?: "panel" | "embedded";
  projectId?: string;
  onClose?: () => void;
  onCopyQuote?: (text: string, page: number) => void;
  onSaveHighlighted?: (highlights: HighlightItem[]) => void;
}

const COLORS: PdfAnnotation["color"][] = ["yellow", "green", "blue", "pink"];

export const PdfViewer: React.FC<PdfViewerProps> = ({
  paperId,
  paperTitle,
  initialPage = 1,
  totalPages = null,
  highlightText = "",
  highlights = [],
  mode = "panel",
  projectId,
  onClose,
  onCopyQuote,
  onSaveHighlighted,
}) => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [annotationPage, setAnnotationPage] = useState(initialPage);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(highlightText);
  const [note, setNote] = useState("");
  const [color, setColor] = useState<PdfAnnotation["color"]>("yellow");
  const [showAnnotations, setShowAnnotations] = useState(mode === "embedded");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState("");
  const [isResizing, setIsResizing] = useState(false);
  const [panelWidth, setPanelWidth] = useState(42);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number; pointerId: number } | null>(null);

  useEffect(() => {
    setAnnotationPage(currentPage);
  }, [currentPage]);

  const pdfUrl = useMemo(() => {
    if (highlights.length > 0) {
      const hlParam = encodeURIComponent(JSON.stringify(highlights));
      return getAuthenticatedApiUrl(`/api/papers/${paperId}/viewer?hl=${hlParam}#page=${currentPage}`);
    }
    return getAuthenticatedApiUrl(`/api/papers/${paperId}/file#page=${currentPage}`);
  }, [paperId, currentPage, highlights]);

  const loadReaderData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [annotationData, progress] = await Promise.all([
        api.listAnnotations(paperId),
        api.getReadingProgress(paperId),
      ]);
      setAnnotations(annotationData.annotations);
      const startPage = initialPage > 1 ? initialPage : progress.current_page || 1;
      setCurrentPage(startPage);
      setPageInput(String(startPage));
      setAnnotationPage(startPage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("pdf.load_error"));
    } finally {
      setLoading(false);
    }
  }, [initialPage, paperId, t]);

  useEffect(() => {
    void loadReaderData();
  }, [loadReaderData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api.saveReadingProgress(paperId, currentPage).catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [currentPage, paperId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        let data = event.data;
        if (typeof data === "string") {
          data = JSON.parse(data);
        }
        if (data && typeof data === "object") {
          const page = Number(data.pageNumber || data.page || data.currentPage || (data.detail && data.detail.pageNumber));
          if (Number.isFinite(page) && page > 0) {
            setCurrentPage(page);
            setPageInput(String(page));
            setAnnotationPage(page);
          }
        }
      } catch {}
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const goToPage = useCallback((page: number) => {
    const nextPage = Math.max(1, Math.min(page, totalPages || 9999));
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
    setAnnotationPage(nextPage);
  }, [totalPages]);

  const submitPage = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) goToPage(parsed);
    else setPageInput(String(currentPage));
  };

  const saveAnnotation = async () => {
    if (!quote.trim() && !note.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await api.createAnnotation(paperId, {
        page_number: annotationPage,
        kind: quote.trim() ? "highlight" : "note",
        quote_text: quote.trim(),
        note: note.trim(),
        color,
        project_id: projectId,
      });
      setAnnotations((items) => [...items, created].sort((a, b) => a.page_number - b.page_number));
      setQuote("");
      setNote("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("pdf.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (item: PdfAnnotation) => {
    setSaving(true);
    try {
      const updated = await api.updateAnnotation(item.id, { note: editingNote });
      setAnnotations((items) => items.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setEditingId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("pdf.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const removeAnnotation = async (id: string) => {
    try {
      await api.deleteAnnotation(id);
      setAnnotations((items) => items.filter((item) => item.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("pdf.delete_error"));
    }
  };

  const copyQuote = async (item: PdfAnnotation) => {
    const text = item.quote_text || item.note;
    await navigator.clipboard.writeText(text);
    onCopyQuote?.(text, item.page_number);
  };

  const endResize = useCallback(() => {
    setIsResizing(false);
    resizeRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current || resizeRef.current.pointerId !== event.pointerId) return;
    const containerWidth = panelRef.current?.parentElement?.clientWidth || window.innerWidth;
    setPanelWidth(Math.max(28, Math.min(72, resizeRef.current.startWidth + ((event.clientX - resizeRef.current.startX) / containerWidth) * 100)));
  };

  useEffect(() => () => endResize(), [endResize]);

  return (
    <>
      {isResizing && <div className="pdf-resize-overlay" aria-hidden="true" />}
      <section
        ref={panelRef}
        className={`pdf-reader pdf-reader--${mode}${isResizing ? " pdf-viewer-panel--resizing" : ""}`}
        style={mode === "panel" ? { width: `${panelWidth}%` } : undefined}
        aria-label={t("pdf.reader")}
      >
        <header className="pdf-reader__toolbar">
          {mode !== "embedded" && (
            <>
              <div className="pdf-reader__identity">
                <IconFileText size={15} />
                <strong title={paperTitle}>{paperTitle}</strong>
              </div>
              <div className="pdf-reader__pager">
                <button type="button" className="pdf-tool-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label={t("pdf.previous")}>‹</button>
                <label className="pdf-page-field">
                  <span className="sr-only">{t("pdf.go_to_page")}</span>
                  <input
                    inputMode="numeric"
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value)}
                    onBlur={submitPage}
                    onKeyDown={(event) => event.key === "Enter" && submitPage()}
                  />
                  {totalPages ? <span>/ {totalPages}</span> : null}
                </label>
                <button type="button" className="pdf-tool-btn" onClick={() => goToPage(currentPage + 1)} disabled={Boolean(totalPages && currentPage >= totalPages)} aria-label={t("pdf.next")}>›</button>
              </div>
            </>
          )}
          <div className="pdf-reader__actions">
            {highlights.length > 0 && (
              <button
                type="button"
                className="pdf-tool-btn"
                onClick={() => onSaveHighlighted?.(highlights)}
                title={t("pdf.save_highlighted")}
              >
                <IconWithText icon={IconDownload} size={13}>
                  {t("pdf.save_highlighted")} ({highlights.length})
                </IconWithText>
              </button>
            )}
            <button
              type="button"
              className={`pdf-tool-btn${showAnnotations ? " is-active" : ""}`}
              onClick={() => setShowAnnotations((value) => !value)}
              aria-expanded={showAnnotations}
            >
              <IconWithText icon={IconBookmark} size={13}>{t("pdf.annotations")} <span className="pdf-count">{annotations.length}</span></IconWithText>
            </button>
            {onClose && <button type="button" className="pdf-tool-btn" onClick={onClose} aria-label={t("pdf.close")}><IconClose size={15} /></button>}
          </div>
        </header>

        {error && <div className="pdf-reader__error" role="alert">{error}</div>}

        <div className="pdf-reader__body">
          <iframe key={`${paperId}-${currentPage}`} src={pdfUrl} title={`${t("pdf.preview_title")} — ${paperTitle}`} />

          {showAnnotations && (
            <aside className="pdf-annotations" aria-label={t("pdf.annotations")}>
              <div className="pdf-annotation-composer">
                <div className="pdf-annotation-composer__heading">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong>{t("pdf.add_annotation")}</strong>
                    <select
                      className="pdf-annotation-page-select-dropdown"
                      value={annotationPage}
                      onChange={(e) => {
                        const p = Number(e.target.value);
                        setAnnotationPage(p);
                        goToPage(p);
                      }}
                      title={t("pdf.go_to_page")}
                      style={{ fontSize: 12 }}
                    >
                      {Array.from({ length: totalPages || 1 }, (_, i) => i + 1).map((p) => (
                        <option key={p} value={p}>
                          Trang {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="pdf-close-sidebar-btn"
                    onClick={() => setShowAnnotations(false)}
                    title={t("pdf.close")}
                  >
                    ✕
                  </button>
                </div>
                <div className="pdf-annotation-field">
                  <label className="pdf-annotation-field-label">{t("pdf.quote_label")}</label>
                  <textarea value={quote} onChange={(event) => setQuote(event.target.value)} placeholder={t("pdf.quote_placeholder")} rows={2} />
                </div>
                <div className="pdf-annotation-field">
                  <label className="pdf-annotation-field-label">{t("pdf.note_label")}</label>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("pdf.note_placeholder")} rows={2} />
                </div>
                <div className="pdf-annotation-composer__footer">
                  <div className="pdf-color-picker" aria-label={t("pdf.color")}>
                    {COLORS.map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={`pdf-color pdf-color--${item}${color === item ? " is-active" : ""}`}
                        onClick={() => setColor(item)}
                        aria-label={t(`pdf.color_${item}`)}
                        aria-pressed={color === item}
                      />
                    ))}
                  </div>
                  <button type="button" className="pdf-save-annotation-btn" disabled={saving || (!quote.trim() && !note.trim())} onClick={saveAnnotation}>
                    {saving ? <IconSpinner size={13} /> : <IconBookmark size={13} />}
                    <span>{t("pdf.save_annotation")}</span>
                  </button>
                </div>
              </div>

              <div className="pdf-annotation-list">
                {loading ? (
                  <div className="pdf-annotation-empty"><IconSpinner size={18} />{t("common.loading")}</div>
                ) : annotations.length === 0 ? (
                  <div className="pdf-annotation-empty"><IconBookmark size={20} /><span>{t("pdf.no_annotations")}</span></div>
                ) : annotations.map((item) => (
                  <article key={item.id} className={`pdf-annotation pdf-annotation--${item.color}`}>
                    <button type="button" className="pdf-annotation__page" onClick={() => goToPage(item.page_number)}>
                      {t("pdf.page_short", { page: item.page_number })}
                    </button>
                    {item.quote_text && <blockquote>“{item.quote_text}”</blockquote>}
                    {editingId === item.id ? (
                      <div className="pdf-annotation__edit">
                        <textarea value={editingNote} onChange={(event) => setEditingNote(event.target.value)} rows={2} autoFocus />
                        <button type="button" className="pdf-icon-action" onClick={() => void saveEdit(item)} aria-label={t("common.save")}><IconCheck size={14} /></button>
                      </div>
                    ) : item.note ? <p>{item.note}</p> : null}
                    <footer>
                      <button type="button" className="pdf-icon-action" onClick={() => void copyQuote(item)} aria-label={t("pdf.copy")}><IconClipboard size={13} /></button>
                      <button type="button" className="pdf-icon-action" onClick={() => { setEditingId(item.id); setEditingNote(item.note); }} aria-label={t("common.edit")}><IconEdit size={13} /></button>
                      <button type="button" className="pdf-icon-action pdf-icon-action--danger" onClick={() => void removeAnnotation(item.id)} aria-label={t("common.delete")}><IconTrash size={13} /></button>
                    </footer>
                  </article>
                ))}
              </div>
            </aside>
          )}
        </div>

        {mode === "panel" && (
          <div
            className="pdf-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("pdf.resize")}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              resizeRef.current = { startX: event.clientX, startWidth: panelWidth, pointerId: event.pointerId };
              setIsResizing(true);
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            onPointerMove={resize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
        )}
      </section>
    </>
  );
};
