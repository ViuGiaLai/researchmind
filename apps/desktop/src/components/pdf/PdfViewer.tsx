import React, { useState, useRef, useEffect, useCallback } from "react";
import { BASE_URL } from "../../lib/api";

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
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [showHighlightBanner, setShowHighlightBanner] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [panelWidth, setPanelWidth] = useState(50);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pdfUrlRef = useRef("");

  const cacheBuster = Date.now();
  const pdfUrl = `${BASE_URL}/api/papers/${paperId}/file#page=${currentPage}&_=${cacheBuster}`;

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

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: panelWidth };
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = e.clientX - resizeRef.current.startX;
      const containerWidth = window.innerWidth;
      const pct = resizeRef.current.startWidth + (dx / containerWidth) * 100;
      setPanelWidth(Math.max(20, Math.min(80, pct)));
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      className="pdf-viewer-panel"
      style={{
        width: `${panelWidth}%`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-surface, #141414)",
        borderRight: "1px solid var(--color-border, #282828)",
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
          borderBottom: "1px solid var(--color-border, #282828)",
          background: "var(--color-surface, #141414)",
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
          <span style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
            Trang {currentPage}{totalPages ? ` / ${totalPages}` : ""}
          </span>
        </div>

        <div className="pdf-viewer-nav" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            className="pdf-nav-btn"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            title="Trang trước"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "4px",
              color: "var(--color-text, #e4e4e7)",
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
              color: "var(--color-text, #e4e4e7)",
              padding: "2px 4px",
              fontSize: "0.8rem",
              outline: "none",
            }}
          />
          <button
            className="pdf-nav-btn"
            onClick={() => goToPage(currentPage + 1)}
            title="Trang sau"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "4px",
              color: "var(--color-text, #e4e4e7)",
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
            title="Trích dẫn văn bản đã chọn"
            style={{
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "4px",
              color: "var(--color-primary, #6366f1)",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: "0.75rem",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            📋 Trích dẫn
          </button>
          <button
            className="pdf-close-btn"
            onClick={onClose}
            title="Đóng PDF"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted, #94a3b8)",
              cursor: "pointer",
              fontSize: "1rem",
              padding: "4px",
              lineHeight: 1,
            }}
          >
            ✕
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
          <span>🔍</span>
          <span style={{ flex: 1, fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            "{highlightText}"
          </span>
          <button
            onClick={() => setShowHighlightBanner(false)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "0.8rem" }}
          >
            ✕
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
          }}
          title={`PDF - ${paperTitle}`}
        />
      </div>

      {/* Resize Handle */}
      <div
        className="pdf-resize-handle"
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "4px",
          cursor: "col-resize",
          background: isResizing ? "var(--color-primary, #6366f1)" : "transparent",
          transition: "background 0.15s",
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          if (!isResizing) (e.currentTarget as HTMLDivElement).style.background = "rgba(99, 102, 241, 0.3)";
        }}
        onMouseLeave={(e) => {
          if (!isResizing) (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      />
    </div>
  );
};
