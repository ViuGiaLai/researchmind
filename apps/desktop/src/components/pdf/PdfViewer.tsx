import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getAuthenticatedApiUrl } from "../../lib/api";
import { IconSearch, IconClipboard, IconClose, IconWithText } from "../Icons";

interface PdfViewerProps {
  paperId: string;
  paperTitle: string;
  initialPage?: number;
  highlightText?: string;
  onClose?: () => void;
  onCopyQuote?: (text: string, page: number) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  paperId,
  paperTitle,
  initialPage = 1,
  highlightText,
  onClose,
  onCopyQuote,
}) => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [showHighlightBanner, setShowHighlightBanner] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [panelWidth, setPanelWidth] = useState(40);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number; pointerId: number } | null>(null);
  const pdfUrlRef = useRef("");

  const cacheBuster = Date.now();
  const pdfUrl = getAuthenticatedApiUrl(`/api/papers/${paperId}/file?_=${cacheBuster}#page=${currentPage}`);

  useEffect(() => {
    pdfUrlRef.current = pdfUrl;
  }, [pdfUrl]);

  useEffect(() => {
    setCurrentPage(initialPage);
    setPageInput(String(initialPage));
  }, [initialPage]);

  useEffect(() => {
    if (highlightText) {
      setShowHighlightBanner(true);
      const timer = setTimeout(() => setShowHighlightBanner(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [highlightText]);

  const goToPage = useCallback((page: number) => {
    const p = Math.max(1, Math.min(page, totalPages || 9999));
    setCurrentPage(p);
    setPageInput(String(p));
  }, [totalPages]);

  const handlePageInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const p = parseInt(pageInput, 10);
      if (!isNaN(p)) goToPage(p);
    }
  }, [pageInput, goToPage]);

  const handleCopyQuote = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onCopyQuote?.(text.trim(), currentPage);
      }
    } catch {
      try {
        if (iframeRef.current?.contentWindow) {
          const selection = iframeRef.current.contentWindow.getSelection()?.toString();
          if (selection?.trim()) {
            onCopyQuote?.(selection.trim(), currentPage);
          }
        }
      } catch {
      }
    }
  };

  const endResize = useCallback(() => {
    setIsResizing(false);
    resizeRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: panelWidth, pointerId: e.pointerId };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current || resizeRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - resizeRef.current.startX;
    const containerWidth = panelRef.current?.parentElement?.clientWidth ?? window.innerWidth;
    const pct = resizeRef.current.startWidth + (dx / containerWidth) * 100;
    setPanelWidth(Math.max(20, Math.min(80, pct)));
  }, []);

  const handleResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current || resizeRef.current.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    endResize();
  }, [endResize]);

  useEffect(() => {
    if (!isResizing) return;

    const onWindowBlur = () => endResize();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") endResize();
    };

    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, endResize]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <>
    {isResizing && (
      <div
        className="pdf-resize-overlay"
        aria-hidden="true"
      />
    )}
    <div
      ref={panelRef}
      className={`pdf-viewer-panel${isResizing ? " pdf-viewer-panel--resizing" : ""}`}
      style={{
        width: `${panelWidth}%`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="pdf-viewer-header"
        style={{
          height: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          flexShrink: 0,
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontWeight: 600,
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "200px",
            }}
            title={paperTitle}
          >
            {paperTitle}
          </span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
            {t("pdf.page", { n: currentPage, separator: totalPages ? " / " : "", total: totalPages || "" })}
          </span>
        </div>

        <div className="pdf-viewer-nav" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            className="pdf-nav-btn"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            title={t("pdf.previous")}
            style={{
              background: "transparent",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "4px",
              color: "var(--color-text)",
              cursor: "pointer",
              padding: "2px 8px",
              fontSize: "0.8rem",
              opacity: currentPage <= 1 ? 0.4 : 1,
            }}
          >
            ◀
          </button>
          <input
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={handlePageInput}
            style={{
              width: "48px",
              textAlign: "center",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "4px",
              color: "var(--color-text)",
              padding: "2px 4px",
              fontSize: "0.8rem",
              outline: "none",
            }}
          />
          <button
            className="pdf-nav-btn"
            onClick={() => goToPage(currentPage + 1)}
            title={t("pdf.next")}
            style={{
              background: "transparent",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "4px",
              color: "var(--color-text)",
              cursor: "pointer",
              padding: "2px 8px",
              fontSize: "0.8rem",
            }}
          >
            ▶
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            className="pdf-action-btn"
            onClick={handleCopyQuote}
            title={t("pdf.next")}
            style={{
              background: "rgba(var(--color-primary-rgb), 0.08)",
              border: "1px solid rgba(var(--color-primary-rgb), 0.2)",
              borderRadius: "4px",
              color: "var(--color-primary)",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: "0.75rem",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            <IconWithText icon={IconClipboard} size={12}>{t("pdf.quote_btn")}</IconWithText>
          </button>
            <button
            className="pdf-close-btn"
            onClick={onClose}
            title={t("pdf.quote")}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: "1rem",
              padding: "4px",
              lineHeight: 1,
            }}
          >
            <IconClose size={16} />
          </button>
        </div>
      </div>

      {/* Highlight Banner */}
      {showHighlightBanner && highlightText && (
        <div
          className="pdf-highlight-banner"
          style={{
            padding: "8px 12px",
            background: "rgba(251, 191, 36, 0.1)",
            borderBottom: "1px solid rgba(251, 191, 36, 0.2)",
            fontSize: "0.78rem",
            color: "var(--color-warning, #f59e0b)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          <IconSearch size={14} />
          <span style={{ flex: 1, fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            "{highlightText}"
          </span>
          <button
            onClick={() => setShowHighlightBanner(false)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "0.8rem", display: "flex" }}
            aria-label={t("pdf.close_aria")}
          >
            <IconClose size={14} />
          </button>
        </div>
      )}

      {/* PDF Content */}
      <div style={{ flex: 1, position: "relative" }}>
        <iframe
          ref={iframeRef}
          key={`${paperId}-page-${currentPage}`}
          src={pdfUrl}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            pointerEvents: isResizing ? "none" : "auto",
          }}
          title={`${t("pdf.preview_title")} - ${paperTitle}`}
        />
      </div>

      {/* Resize Handle — pointer capture avoids iframe swallowing mouseup */}
      <div
        className="pdf-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("pdf.resize")}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onLostPointerCapture={handleResizeEnd}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "10px",
          marginRight: "-3px",
          cursor: "col-resize",
          background: isResizing ? "var(--color-primary)" : "transparent",
          transition: isResizing ? "none" : "background 0.15s",
          zIndex: 20,
          touchAction: "none",
        }}
        onMouseEnter={(e) => {
          if (!isResizing) (e.currentTarget as HTMLDivElement).style.background = "rgba(var(--color-primary-rgb), 0.3)";
        }}
        onMouseLeave={(e) => {
          if (!isResizing) (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      />
    </div>
    </>
  );
};
