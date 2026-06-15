import React, { useEffect, useState } from "react";
import { api, Paper, RelatedPaper, Highlight } from "../../lib/api";
import { ImportPanel } from "../import/ImportPanel";
import {
  IconBrain,
  IconStar,
  IconTrash,
  IconFileText,
  IconSpinner,
  IconChat,
  IconUpload,
  IconLibrary,
  IconBookOpen,
  IconCheck,
  IconBulb,
  IconSparkle,
} from "../Icons";

const PAGE_SIZE = 20;

const renderStatusIcon = (status: string, size = 16) => {
  if (status === "read") {
    return <IconCheck size={size} style={{ color: "var(--color-success, #22c55e)" }} />;
  }
  if (status === "reading") {
    return <IconBookOpen size={size} style={{ color: "var(--color-warning, #eab308)" }} />;
  }
  return <IconFileText size={size} style={{ color: "var(--color-text-muted, #94a3b8)" }} />;
};

export const LibraryView: React.FC<{
  onStartChat: (paperIds: string[]) => void;
  onStartReview: (paperIds: string[]) => void;
  onStartCritique: (paperIds: string[]) => void;
  onStartDebate?: (paperIds: string[]) => void;
  onStartWow?: (paperId: string) => void;
}> = ({ onStartChat, onStartReview, onStartCritique, onStartDebate, onStartWow }) => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);

  // Zotero-style preview panel states
  const [activePaper, setActivePaper] = useState<Paper | null>(null);
  const [previewTab, setPreviewTab] = useState<"info" | "pdf" | "related" | "highlights">("info");
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Related papers state
  const [relatedPapers, setRelatedPapers] = useState<RelatedPaper[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Highlights state
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);

  useEffect(() => {
    loadPapers();
  }, [page, filter]);

  useEffect(() => {
    if (activePaper) {
      setNotes(activePaper.notes || "");
      setShowTagInput(false);
      setTagInput("");
      setRelatedPapers([]);
      setHighlights([]);
    }
  }, [activePaper?.id]);

  const loadPapers = async () => {
    setLoading(true);
    try {
      const statusFilter = ["unread", "reading", "read"].includes(filter) ? "indexed" : filter === "all" ? undefined : filter;
      const res = await api.listPapers(page, PAGE_SIZE, statusFilter);

      let filtered = res.papers;
      if (filter === "unread") filtered = filtered.filter((p) => p.read_status === "unread");
      else if (filter === "reading") filtered = filtered.filter((p) => p.read_status === "reading");
      else if (filter === "read") filtered = filtered.filter((p) => p.read_status === "read");

      setPapers(filtered);
      setTotal(filtered.length);

      // Default active paper to the first one in the list if none selected
      if (filtered.length > 0 && !activePaper) {
        setActivePaper(filtered[0]);
      }
    } catch (e) {
      console.error("Failed to load papers:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleStar = async (id: string, starred: boolean) => {
    try {
      const updated = await api.updatePaper(id, { starred: !starred } as Partial<Paper>);
      setPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (activePaper?.id === id) {
        setActivePaper(updated);
      }
    } catch (e) {
      console.error("Failed to toggle star:", e);
    }
  };

  const toggleReadStatus = async (id: string, current: string) => {
    const next = current === "unread" ? "reading" : current === "reading" ? "read" : "unread";
    try {
      const updated = await api.updatePaper(id, { read_status: next } as Partial<Paper>);
      setPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (activePaper?.id === id) {
        setActivePaper(updated);
      }
    } catch (e) {
      console.error("Failed to update read status:", e);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deletePaper = async (id: string) => {
    if (!confirm("Xoá paper này?")) return;
    try {
      await api.deletePaper(id);
      if (activePaper?.id === id) {
        setActivePaper(null);
      }
      loadPapers();
    } catch (e) {
      console.error("Failed to delete paper:", e);
    }
  };

  const saveNotes = async () => {
    if (!activePaper) return;
    setSavingNotes(true);
    try {
      const updated = await api.updatePaper(activePaper.id, { notes } as Partial<Paper>);
      setPapers((prev) => prev.map((p) => (p.id === activePaper.id ? updated : p)));
      setActivePaper(updated);
      alert("Đã lưu ghi chú!");
    } catch (e) {
      console.error("Failed to save notes:", e);
      alert("Lỗi lưu ghi chú.");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddTag = async () => {
    if (!activePaper || !tagInput.trim()) return;
    let currentTags: string[] = [];
    try {
      currentTags = JSON.parse(activePaper.tags || "[]");
    } catch {
      currentTags = [];
    }
    const newTag = tagInput.trim();
    if (!currentTags.includes(newTag)) {
      const newTags = [...currentTags, newTag];
      try {
        const updated = await api.updatePaper(activePaper.id, { tags: JSON.stringify(newTags) } as Partial<Paper>);
        setPapers((prev) => prev.map((p) => (p.id === activePaper.id ? updated : p)));
        setActivePaper(updated);
        setTagInput("");
        setShowTagInput(false);
      } catch (e) {
        console.error("Failed to add tag:", e);
      }
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!activePaper) return;
    let currentTags: string[] = [];
    try {
      currentTags = JSON.parse(activePaper.tags || "[]");
    } catch {
      currentTags = [];
    }
    const newTags = currentTags.filter((t) => t !== tagToRemove);
    try {
      const updated = await api.updatePaper(activePaper.id, { tags: JSON.stringify(newTags) } as Partial<Paper>);
      setPapers((prev) => prev.map((p) => (p.id === activePaper.id ? updated : p)));
      setActivePaper(updated);
    } catch (e) {
      console.error("Failed to remove tag:", e);
    }
  };

  const parseTags = (tagsStr: string): string[] => {
    try {
      return JSON.parse(tagsStr || "[]");
    } catch {
      return [];
    }
  };

  const loadHighlights = async (paperId: string) => {
    setLoadingHighlights(true);
    try {
      const res = await api.findHighlights(paperId, 10);
      setHighlights(res.highlights || []);
    } catch (e) {
      console.error("Failed to load highlights:", e);
      setHighlights([]);
    } finally {
      setLoadingHighlights(false);
    }
  };

  const loadRelatedPapers = async (paperId: string) => {
    setLoadingRelated(true);
    try {
      const res = await api.findRelatedPapers(paperId, 5);
      setRelatedPapers(res.related_papers);
    } catch (e) {
      console.error("Failed to load related papers:", e);
      setRelatedPapers([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="library-split-view">
      {/* Left panel: Paper list */}
      <div className="library-main-panel">
        {/* Import section */}
        {showImport ? (
          <div className="library-import-section">
            <div className="library-import-header">
              <h3><IconUpload size={18} style={{ marginRight: 6 }} /> Import PDF</h3>
              <button className="library-import-close" onClick={() => setShowImport(false)}>✕</button>
            </div>
            <ImportPanel
              onImported={(paperId) => {
                loadPapers();
                setShowImport(false);
                if (paperId && onStartWow) {
                  onStartWow(paperId);
                }
              }}
            />
          </div>
        ) : (
          <div className="library-header">
            <div className="library-header-left">
              <h2 className="library-title">
                <IconLibrary size={22} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 8 }} />
                Thư viện
              </h2>
              <span className="library-count">{total} papers</span>
            </div>
            <div className="library-actions">
              <div className="library-filters">
                {["all", "indexed", "unread", "reading", "read"].map((f) => (
                  <button
                    key={f}
                    className={`library-filter-chip ${filter === f ? "active" : ""}`}
                    onClick={() => { setFilter(f); setPage(1); }}
                  >
                    {f === "all" ? "Tất cả" : f === "indexed" ? "Đã index" : f === "unread" ? "Chưa đọc" : f === "reading" ? "Đang đọc" : "Đã đọc"}
                  </button>
                ))}
              </div>
              <div className="library-action-buttons">
                <button className="library-import-btn" onClick={() => setShowImport(true)}>
                  <IconUpload size={16} style={{ marginRight: 4 }} />
                  Import PDF
                </button>
                {selected.size > 0 && (
                  <>
                    <button className="library-danger-btn" onClick={() => onStartCritique(Array.from(selected))}>
                      <IconBrain size={16} style={{ marginRight: 4 }} />
                      Phản biện ({selected.size})
                    </button>
                    {onStartDebate && (
                      <button className="library-debate-btn" onClick={() => onStartDebate(Array.from(selected))}>
                        <IconBulb size={16} style={{ marginRight: 4 }} />
                        Tranh luận ({selected.size})
                      </button>
                    )}
                    <button className="library-secondary-btn" onClick={() => onStartReview(Array.from(selected))}>
                      <IconFileText size={16} style={{ marginRight: 4 }} />
                      Tạo Review ({selected.size})
                    </button>
                    <button className="library-chat-btn" onClick={() => onStartChat(Array.from(selected))}>
                      <IconChat size={16} style={{ marginRight: 4 }} />
                      Chat ({selected.size})
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Paper list container */}
        {loading ? (
          <div className="library-loading">
            <IconSpinner size={24} />
            <span>Đang tải...</span>
          </div>
        ) : papers.length === 0 ? (
          <div className="library-empty">
            <IconBrain size={48} className="icon-gradient" />
            <h3>Chưa có paper nào</h3>
            <button className="library-import-btn library-empty-import" onClick={() => setShowImport(true)}>
              <IconUpload size={16} style={{ marginRight: 4 }} />
              Import PDF đầu tiên
            </button>
          </div>
        ) : (
          <div className="library-list">
            {papers.map((p) => (
              <div
                key={p.id}
                className={`library-card ${activePaper?.id === p.id ? "active-row" : ""} ${selected.has(p.id) ? "selected" : ""}`}
                onClick={() => setActivePaper(p)}
              >
                <div
                  className="library-card-check"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(p.id);
                  }}
                >
                  <div className={`checkbox ${selected.has(p.id) ? "checked" : ""}`} />
                </div>
                <div className="library-card-icon">
                  <IconFileText size={24} />
                </div>
                <div className="library-card-content">
                  <div className="library-card-header">
                    <span className="library-card-title">{p.title || p.filename}</span>
                    <span className="library-card-status" title={p.read_status === "read" ? "Đã đọc" : p.read_status === "reading" ? "Đang đọc" : "Chưa đọc"}>
                      {renderStatusIcon(p.read_status)}
                    </span>
                  </div>
                  <div className="library-card-meta">
                    {p.authors && p.authors !== "[]" && (
                      <span>{p.authors.replace(/[\[\]"']/g, "")} · </span>
                    )}
                    {p.year && <span>{p.year} · </span>}
                    <span>{p.language.toUpperCase()} · </span>
                    <span>{p.page_count || "?"} trang</span>
                  </div>
                </div>
                <div className="library-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="library-action-btn" onClick={() => toggleReadStatus(p.id, p.read_status)} title="Đổi trạng thái đọc">
                    {renderStatusIcon(p.read_status)}
                  </button>
                  <button className="library-action-btn" onClick={() => toggleStar(p.id, p.starred)} title="Yêu thích">
                    <IconStar size={16} className={p.starred ? "starred" : ""} />
                  </button>
                  <button className="library-action-btn danger" onClick={() => deletePaper(p.id)} title="Xoá">
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && !showImport && (
          <div className="library-pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</button>
            <span>Trang {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Sau →</button>
          </div>
        )}
      </div>

      {/* Right panel: Zotero-style preview panel */}
      <div className="library-preview-panel">
        {activePaper ? (
          <>
            <div className="preview-header">
              <h3 className="preview-title" title={activePaper.title || activePaper.filename}>
                {activePaper.title || activePaper.filename}
              </h3>
              <div className="preview-actions">
                {onStartWow && (
                  <button
                    className="preview-btn wow-glow-btn"
                    onClick={() => onStartWow(activePaper.id)}
                    style={{
                      background: "linear-gradient(135deg, var(--color-primary), #ec4899)",
                      color: "#fff",
                      border: "none",
                    }}
                  >
                    <IconSparkle size={14} />
                    <span>⚡ Phân tích WOW</span>
                  </button>
                )}
                <button
                  className="preview-btn primary"
                  onClick={() => onStartChat([activePaper.id])}
                >
                  <IconChat size={14} />
                  <span>Hỏi AI về paper này</span>
                </button>
                {onStartDebate && (
                  <button
                    className="preview-btn"
                    onClick={() => onStartDebate([activePaper.id])}
                  >
                    <IconBulb size={14} />
                    <span>Tranh luận</span>
                  </button>
                )}
                <button
                  className="preview-btn"
                  onClick={() => toggleReadStatus(activePaper.id, activePaper.read_status)}
                >
                  {renderStatusIcon(activePaper.read_status, 14)}
                  <span>
                    {activePaper.read_status === "read"
                      ? "Đã đọc"
                      : activePaper.read_status === "reading"
                      ? "Đang đọc"
                      : "Chưa đọc"}
                  </span>
                </button>
                <button
                  className="preview-btn"
                  onClick={() => toggleStar(activePaper.id, activePaper.starred)}
                >
                  <IconStar size={14} className={activePaper.starred ? "starred" : ""} />
                  <span>Yêu thích</span>
                </button>
              </div>
            </div>

            <div className="preview-tabs">
              <button
                className={`preview-tab-btn ${previewTab === "info" ? "active" : ""}`}
                onClick={() => setPreviewTab("info")}
              >
                Tóm tắt & Thông tin
              </button>
              <button
                className={`preview-tab-btn ${previewTab === "related" ? "active" : ""}`}
                onClick={() => {
                  setPreviewTab("related");
                  if (relatedPapers.length === 0 && activePaper) {
                    loadRelatedPapers(activePaper.id);
                  }
                }}
              >
                Papers liên quan
              </button>
              <button
                className={`preview-tab-btn ${previewTab === "highlights" ? "active" : ""}`}
                onClick={() => {
                  setPreviewTab("highlights");
                  if (highlights.length === 0 && activePaper) {
                    loadHighlights(activePaper.id);
                  }
                }}
              >
                Đoạn quan trọng
              </button>
              <button
                className={`preview-tab-btn ${previewTab === "pdf" ? "active" : ""}`}
                onClick={() => setPreviewTab("pdf")}
              >
                Đọc tài liệu (PDF)
              </button>
            </div>

            {previewTab === "info" ? (
              <div className="preview-body">
                {/* Auto Summary Section - Highlighted */}
                {activePaper.auto_summary && (
                  <div className="preview-summary-section">
                    <div className="preview-summary-header">
                      <span className="preview-summary-icon">🧠</span>
                      <span className="preview-summary-label">Tóm tắt tự động bởi ResearchMind</span>
                    </div>
                    <div className="preview-summary-content">
                      {activePaper.auto_summary.split('\n').map((line, i) => {
                        if (line.startsWith('###')) return <h4 key={i} className="summary-heading">{line.replace(/^#+\s*/, '')}</h4>;
                        if (line.startsWith('* **')) {
                          const parts = line.replace(/^\*\s*/, '').split(':');
                          const label = parts[0]?.replace(/\*\*/g, '') || '';
                          const value = parts.slice(1).join(':').trim();
                          return (
                            <div key={i} className="summary-item">
                              <span className="summary-item-label">{label}</span>
                              <span className="summary-item-value">{value}</span>
                            </div>
                          );
                        }
                        if (line.trim()) return <p key={i} className="summary-text">{line}</p>;
                        return null;
                      })}
                    </div>
                  </div>
                )}

                {/* User Notes Section - Editable */}
                <div className="preview-user-notes-section">
                  <div className="preview-user-notes-header">
                    <span className="preview-user-notes-icon">📝</span>
                    <span className="preview-user-notes-label">Ghi chú cá nhân</span>
                  </div>
                  <textarea
                    className="notes-textarea"
                    placeholder="Thêm ghi chú cá nhân của bạn tại đây..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <button
                    className="notes-save-btn"
                    onClick={saveNotes}
                    disabled={savingNotes}
                  >
                    {savingNotes ? "Đang lưu..." : "Lưu ghi chú"}
                  </button>
                </div>

                <div className="metadata-grid">
  

                  <div className="metadata-item">
                    <span className="metadata-label">Thẻ (Tags)</span>
                    <div className="tags-input-container">
                      <div className="tags-list">
                        {parseTags(activePaper.tags).map((tag) => (
                          <span key={tag} className="tag-badge">
                            {tag}
                            <span className="tag-remove" onClick={() => handleRemoveTag(tag)}>✕</span>
                          </span>
                        ))}
                        {showTagInput ? (
                          <div className="tag-add-container">
                            <input
                              type="text"
                              className="tag-add-input"
                              placeholder="Tag mới..."
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddTag();
                                if (e.key === "Escape") setShowTagInput(false);
                              }}
                              autoFocus
                            />
                            <button className="tag-add-btn" onClick={handleAddTag}>Thêm</button>
                          </div>
                        ) : (
                          <button className="tag-add-btn" onClick={() => setShowTagInput(true)}>+ Thêm tag</button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">Tác giả</span>
                    <span className="metadata-value">
                      {activePaper.authors && activePaper.authors !== "[]"
                        ? activePaper.authors.replace(/[\[\]"']/g, "")
                        : "Không có thông tin"}
                    </span>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">Năm xuất bản</span>
                    <span className="metadata-value">{activePaper.year || "Không có thông tin"}</span>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">Tên tệp gốc</span>
                    <span className="metadata-value" style={{ wordBreak: "break-all" }}>{activePaper.filename}</span>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">Kích thước file</span>
                    <span className="metadata-value">{(activePaper.file_size / 1024).toFixed(0)} KB</span>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">Trạng thái index</span>
                    <span className="metadata-value">
                      {activePaper.status === "indexed" ? "✅ Đã trích xuất & Vector hóa" : "⏳ Đang xử lý"}
                    </span>
                  </div>
                </div>
              </div>
            ) : previewTab === "related" ? (
              <div className="preview-body">
                <div className="related-papers-header">
                  <h4 className="related-papers-title">
                    🔗 Papers liên quan (theo embedding similarity)
                  </h4>
                  <button
                    className="related-papers-refresh-btn"
                    onClick={() => activePaper && loadRelatedPapers(activePaper.id)}
                    disabled={loadingRelated}
                  >
                    {loadingRelated ? "Đang tải..." : "Làm mới"}
                  </button>
                </div>

                {loadingRelated ? (
                  <div className="related-papers-loading">
                    <div className="insights-loading-spinner" />
                    <span>Đang tìm papers liên quan...</span>
                  </div>
                ) : relatedPapers.length === 0 ? (
                  <div className="related-papers-empty">
                    <p>Chưa tìm thấy paper liên quan nào.</p>
                    <p className="hint">Hãy import thêm paper để mở rộng mạng lưới kiến thức.</p>
                  </div>
                ) : (
                  <div className="related-papers-list">
                    {relatedPapers.map((rp) => (
                      <div
                        key={rp.paper_id}
                        className="related-paper-card"
                        onClick={() => {
                          const paper = papers.find((p) => p.id === rp.paper_id);
                          if (paper) setActivePaper(paper);
                        }}
                      >
                        <div className="related-paper-score">
                          <span className="related-paper-score-value">
                            {(rp.similarity * 100).toFixed(0)}%
                          </span>
                          <span className="related-paper-score-label">similarity</span>
                        </div>
                        <div className="related-paper-content">
                          <div className="related-paper-title">{rp.title || "Không có tiêu đề"}</div>
                          <div className="related-paper-snippet">{rp.snippet}...</div>
                          <div className="related-paper-meta">
                            {rp.matching_chunks} chunks khớp
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : previewTab === "highlights" ? (
              <div className="preview-body">
                <div className="highlights-header">
                  <h4 className="highlights-title">
                    ✨ Đoạn quan trọng được AI xác định
                  </h4>
                  <button
                    className="highlights-refresh-btn"
                    onClick={() => activePaper && loadHighlights(activePaper.id)}
                    disabled={loadingHighlights}
                  >
                    {loadingHighlights ? "Đang phân tích..." : "Phân tích lại"}
                  </button>
                </div>

                {loadingHighlights ? (
                  <div className="highlights-loading">
                    <div className="insights-loading-spinner" />
                    <span>AI đang phân tích nội dung paper...</span>
                    <span className="highlights-loading-hint">Quá trình này có thể mất 10-20 giây</span>
                  </div>
                ) : highlights.length === 0 ? (
                  <div className="highlights-empty">
                    <p>Chưa có đoạn quan trọng nào được xác định.</p>
                    <p className="hint">Nhấn "Phân tích lại" để AI phân tích nội dung paper.</p>
                  </div>
                ) : (
                  <div className="highlights-list">
                    {highlights.map((h, i) => (
                      <div key={i} className={`highlight-card ${h.importance === "high" ? "highlight-high" : "highlight-medium"}`}>
                        <div className="highlight-card-header">
                          <span className={`highlight-category highlight-cat-${h.category}`}>
                            {h.category === "key_finding" ? "🔬 Kết quả chính"
                              : h.category === "methodology" ? "⚙️ Phương pháp"
                              : h.category === "conclusion" ? "📋 Kết luận"
                              : h.category === "novel_contribution" ? "💡 Đóng góp mới"
                              : h.category === "limitation" ? "⚠️ Hạn chế"
                              : "📌 Khái niệm quan trọng"}
                          </span>
                          {h.page_hint && (
                            <span className="highlight-page">Trang {h.page_hint}</span>
                          )}
                          <span className={`highlight-importance badge-${h.importance}`}>
                            {h.importance === "high" ? "🔴 Quan trọng" : "🟡 Trung bình"}
                          </span>
                        </div>
                        <blockquote className="highlight-text">
                          "{h.text}"
                        </blockquote>
                        <div className="highlight-note">
                          💬 {h.note}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="pdf-iframe-container">
                <iframe
                  src={`http://127.0.0.1:8765/api/papers/${activePaper.id}/file`}
                  className="pdf-iframe"
                  title={activePaper.title || activePaper.filename}
                />
              </div>
            )}
          </>
        ) : (
          <div className="preview-empty">
            <IconFileText size={48} />
            <h3>Chưa chọn tài liệu</h3>
            <p>Chọn một tài liệu trong danh sách bên trái để xem thông tin chi tiết và đọc nội dung PDF.</p>
          </div>
        )}
      </div>
    </div>
  );
};
