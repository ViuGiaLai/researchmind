import React, { useEffect, useState } from "react";
import { api, Paper } from "../../lib/api";
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

export const LibraryView: React.FC<{ onStartChat: (paperIds: string[]) => void }> = ({ onStartChat }) => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    loadPapers();
  }, [page, filter]);

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
    } catch (e) {
      console.error("Failed to load papers:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleStar = async (id: string, starred: boolean) => {
    try {
      await api.updatePaper(id, { starred: !starred } as Partial<Paper>);
      setPapers((prev) => prev.map((p) => (p.id === id ? { ...p, starred: !starred } : p)));
    } catch (e) {
      console.error("Failed to toggle star:", e);
    }
  };

  const toggleReadStatus = async (id: string, current: string) => {
    const next = current === "unread" ? "reading" : current === "reading" ? "read" : "unread";
    try {
      await api.updatePaper(id, { read_status: next } as Partial<Paper>);
      setPapers((prev) => prev.map((p) => (p.id === id ? { ...p, read_status: next } : p)));
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
      loadPapers();
    } catch (e) {
      console.error("Failed to delete paper:", e);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="library-view">
      {/* Import section */}
      {showImport ? (
        <div className="library-import-section">
          <div className="library-import-header">
            <h3><IconUpload size={18} style={{ marginRight: 6 }} /> Import PDF</h3>
            <button className="library-import-close" onClick={() => setShowImport(false)}>✕</button>
          </div>
          <ImportPanel onImported={() => { loadPapers(); setShowImport(false); }} />
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
                <button className="library-chat-btn" onClick={() => onStartChat(Array.from(selected))}>
                  <IconChat size={16} style={{ marginRight: 4 }} />
                  Chat ({selected.size})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Paper list */}
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
              className={`library-card ${selected.has(p.id) ? "selected" : ""}`}
              onClick={() => toggleSelect(p.id)}
            >
              <div className="library-card-check">
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
                  <span>{p.page_count || "?"} trang · </span>
                  <span>{(p.file_size / 1024).toFixed(0)}KB</span>
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
  );
};
