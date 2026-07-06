import React, { useEffect, useState, useRef, useCallback } from "react";
import { api, Collection, Paper, RelatedPaper, Highlight, BASE_URL } from "../../lib/api";
import { ImportPanel } from "../import/ImportPanel";
import { useToast } from "../shared/Toast";
import { ListSkeleton } from "../shared/Skeleton";
import {
  IconBrain,
  IconSearch,
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
  IconDownload,
  IconRefresh,
  IconEdit,
  IconLink,
  IconError,
  IconSettings,
  IconBookmark,
  IconGraph,
} from "../Icons";

const PAGE_SIZE = 500;
const VIRTUAL_ROW_HEIGHT = 88;
const VIRTUAL_OVERSCAN = 6;

const renderStatusIcon = (status: string, size = 16) => {
  if (status === "read") {
    return <IconCheck size={size} style={{ color: "var(--color-success, #22c55e)" }} />;
  }
  if (status === "reading") {
    return <IconBookOpen size={size} style={{ color: "var(--color-warning, #eab308)" }} />;
  }
  return <IconFileText size={size} style={{ color: "var(--color-text-muted)" }} />;
};


const getIndexStatusLabel = (status: string) => {
  if (status === "indexed") return "Đã trích xuất & vector hóa";
  if (status === "needs_ocr") return "Cần OCR lại";
  if (status === "failed") return "Index thất bại";
  if (status === "summarizing") return "Đang tóm tắt";
  if (status === "indexing") return "Đang lập chỉ mục";
  return status || "Chưa rõ";
};

const getCategoryIcon = (category: string, size = 12) => {
  if (category === "key_finding") return <IconSparkle size={size} style={{ color: "#34d399" }} />;
  if (category === "methodology") return <IconSettings size={size} style={{ color: "#818cf8" }} />;
  if (category === "conclusion") return <IconCheck size={size} style={{ color: "#c084fc" }} />;
  if (category === "novel_contribution") return <IconBulb size={size} style={{ color: "#f472b6" }} />;
  if (category === "limitation") return <IconError size={size} style={{ color: "#f87171" }} />;
  return <IconBookmark size={size} />;
};

export const LibraryView: React.FC<{
  onStartChat: (paperIds: string[]) => void;
  onStartReview: (paperIds: string[]) => void;
  onStartCritique: (paperIds: string[]) => void;
  onStartDebate?: (paperIds: string[]) => void;
  onStartVerify?: (paperIds: string[]) => void;
  onStartWow?: (paperId: string) => void;
}> = ({ onStartChat, onStartReview, onStartCritique, onStartDebate, onStartVerify, onStartWow }) => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(() => {
    try { return Number(localStorage.getItem("researchmind:library-page") || "1"); } catch { return 1; }
  });
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>(() => {
    try { return localStorage.getItem("researchmind:library-filter") || "all"; } catch { return "all"; }
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [syncingZotero, setSyncingZotero] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string>(() => {
    try { return localStorage.getItem("researchmind:library-collection") || ""; } catch { return ""; }
  });
  const [targetCollectionId, setTargetCollectionId] = useState<string>("");
  const toast = useToast();

  // Zotero-style preview panel states
  const [activePaper, setActivePaper] = useState<Paper | null>(null);
  const [previewTab, setPreviewTab] = useState<"info" | "pdf" | "related" | "highlights" | "ai">("info");
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const splitViewRef = useRef<HTMLDivElement>(null);
  const [splitting, setSplitting] = useState(false);
  const splitterStart = useRef({ x: 0, leftWidth: 0 });
  const tabsRef = useRef<HTMLDivElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const [panelNarrow, setPanelNarrow] = useState(false);
  const [tabDragging, setTabDragging] = useState(false);
  const tabDragStart = useRef({ x: 0, scrollLeft: 0 });

  // Related papers state
  const [relatedPapers, setRelatedPapers] = useState<RelatedPaper[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Highlights state
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [listScrollTop, setListScrollTop] = useState(0);
  const searchDebounceReady = useRef(false);
  const activePaperIdRef = useRef<string | null>(null);

  useEffect(() => {
    activePaperIdRef.current = activePaper?.id ?? null;
  }, [activePaper?.id]);

  useEffect(() => {
    loadPapers();
  }, [page, filter, activeCollectionId]);

  useEffect(() => {
    if (!searchDebounceReady.current) {
      searchDebounceReady.current = true;
      return;
    }
    const timer = setTimeout(() => {
      setPage(1);
      loadPapers(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const started = performance.now();
    requestAnimationFrame(() => {
      console.info(`LIBRARY_MOUNT_TIMING papers=${papers.length} render=${(performance.now() - started).toFixed(1)}ms`);
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("researchmind:library-page", String(page));
      localStorage.setItem("researchmind:library-filter", filter);
      localStorage.setItem("researchmind:library-collection", activeCollectionId);
    } catch {
      // ignore storage errors
    }
  }, [page, filter, activeCollectionId]);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      const res = await api.listCollections();
      setCollections(res.collections);
    } catch (e) {
      console.error("Failed to load collections:", e);
    }
  };

  const handleZoteroSync = async () => {
    setSyncingZotero(true);
    try {
      const res = await api.syncZoteroSqlite();
      loadPapers();
      toast.addToast(
        "success",
        `Đồng bộ Zotero thành công! Đã thêm ${res.imported} tài liệu mới, sao chép ${res.pdf_imported} tệp PDF. Bỏ qua ${res.duplicates} bản trùng lặp.`
      );
    } catch (e: any) {
      console.error("Zotero sync failed:", e);
      toast.addToast("error", `Lỗi đồng bộ Zotero: ${e.message || e}`);
    } finally {
      setSyncingZotero(false);
    }
  };

  useEffect(() => {
    const el = previewPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPanelNarrow(entry.contentRect.width < 480));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [showNarrowMenu, setShowNarrowMenu] = useState(false);
  useEffect(() => {
    if (!showNarrowMenu) return;
    const close = () => setShowNarrowMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showNarrowMenu]);

  useEffect(() => {
    if (activePaper) {
      setNotes(activePaper.notes || "");
      setShowTagInput(false);
      setTagInput("");
      setRelatedPapers([]);
      setHighlights([]);
    }
  }, [activePaper?.id]);

  const loadPapers = async (forcedPage?: number) => {
    const effectivePage = forcedPage ?? page;
    const started = performance.now();
    setLoading(true);
    try {
      let statusFilter: string | undefined = undefined;
      let readStatusFilter: string | undefined = undefined;
      let starredFilter: boolean | undefined = undefined;

      if (filter === "indexed") {
        statusFilter = "indexed";
      } else if (["unread", "reading", "read"].includes(filter)) {
        statusFilter = "indexed";
        readStatusFilter = filter;
      } else if (filter === "starred") {
        starredFilter = true;
      }

      const res = await api.listPapers(effectivePage, PAGE_SIZE, statusFilter, readStatusFilter, starredFilter, {
        collection_id: activeCollectionId || undefined,
        q: searchQuery.trim() || undefined,
      });

      setPapers(res.papers);
      setTotal(res.total);
      console.info(`LIBRARY_LOAD_TIMING papers=${res.papers.length} total=${res.total} total_ms=${(performance.now() - started).toFixed(1)}`);

      if (res.papers.length === 0) {
        setActivePaper(null);
      } else {
        setActivePaper((prev) => {
          if (prev) {
            const refreshed = res.papers.find((p) => p.id === prev.id);
            return refreshed ?? res.papers[0];
          }
          return res.papers[0];
        });
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

  const createCollection = async () => {
    const name = prompt("Tên collection/project:");
    if (!name?.trim()) return;
    try {
      const collection = await api.createCollection(name.trim());
      setCollections((prev) => [...prev, collection]);
      setActiveCollectionId(collection.id);
      toast.addToast("success", "Đã tạo collection.");
    } catch (e) {
      console.error("Failed to create collection:", e);
      toast.addToast("error", "Không thể tạo collection.");
    }
  };

  const addSelectedToCollection = async () => {
    if (!targetCollectionId || selected.size === 0) return;
    try {
      const res = await api.addPapersToCollection(targetCollectionId, Array.from(selected));
      toast.addToast("success", `Đã thêm ${res.added} paper vào collection.`);
      setSelected(new Set());
      loadCollections();
      loadPapers();
    } catch (e) {
      console.error("Failed to add papers to collection:", e);
      toast.addToast("error", "Không thể thêm paper vào collection.");
    }
  };

  const retryOcr = async (paper: Paper) => {
    try {
      await api.retryPaperOcr(paper.id);
      toast.addToast("success", "Đã đưa tài liệu vào hàng đợi OCR/index lại.");
      loadPapers();
    } catch (e) {
      console.error("Failed to retry OCR:", e);
      toast.addToast("error", "Không thể chạy OCR lại cho tài liệu này.");
    }
  };

  const saveNotes = async () => {
    if (!activePaper) return;
    setSavingNotes(true);
    try {
      const updated = await api.updatePaper(activePaper.id, { notes } as Partial<Paper>);
      setPapers((prev) => prev.map((p) => (p.id === activePaper.id ? updated : p)));
      setActivePaper(updated);
      toast.addToast("success", "Đã lưu ghi chú!");
    } catch (e) {
      console.error("Failed to save notes:", e);
      toast.addToast("error", "Lỗi lưu ghi chú.");
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
    setRelatedPapers([]);
    try {
      const res = await api.findRelatedPapers(paperId, 5);
      if (activePaperIdRef.current !== paperId) return;
      setRelatedPapers(res.related_papers);
    } catch (e) {
      if (activePaperIdRef.current !== paperId) return;
      console.error("Failed to load related papers:", e);
      setRelatedPapers([]);
    } finally {
      if (activePaperIdRef.current === paperId) setLoadingRelated(false);
    }
  };

  const filteredPapersList = papers;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const viewportHeight = listRef.current?.clientHeight || 520;
  const virtualStart = Math.max(0, Math.floor(listScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
  const virtualEnd = Math.min(
    filteredPapersList.length,
    Math.ceil((listScrollTop + viewportHeight) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN
  );
  const virtualPapers = filteredPapersList.slice(virtualStart, virtualEnd);
  const virtualTop = virtualStart * VIRTUAL_ROW_HEIGHT;
  const virtualHeight = filteredPapersList.length * VIRTUAL_ROW_HEIGHT;

  // Export menu helpers
  const menuItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    width: "100%",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 13,
    color: "var(--color-text, #1a1a1a)",
    textAlign: "left",
  };
  const highlightOn = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-hover)";
  };
  const highlightOff = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
  };

  // ─── Export Helpers ────────────────────────────────────
  const getPaperTitle = (paperId: string): string => {
    const p = papers.find((p) => p.id === paperId);
    return p?.title?.replace(/[^a-zA-Z0-9_\-\p{L}]/gu, "_") || paperId;
  };

  const handleExportHtml = async (paperId: string) => {
    try {
      setExportingId(paperId);
      const blob = await api.exportPaperHtml(paperId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${getPaperTitle(paperId)}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export HTML:", e);
      toast.addToast("error", "Không thể export HTML. Vui lòng kiểm tra backend.");
    } finally {
      setExportingId(null);
    }
  };

  const handleExportDocx = async (paperId: string) => {
    try {
      setExportingId(paperId);
      const blob = await api.exportPaperDocx(paperId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${getPaperTitle(paperId)}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export DOCX:", e);
      toast.addToast("error", "Không thể export DOCX. Vui lòng kiểm tra backend và cài python-docx.");
    } finally {
      setExportingId(null);
    }
  };

  const handleTabDragStart = useCallback((e: React.MouseEvent) => {
    setTabDragging(true);
    tabDragStart.current = { x: e.clientX, scrollLeft: tabsRef.current?.scrollLeft || 0 };
  }, []);
  const handleTabDragMove = useCallback((e: React.MouseEvent) => {
    if (!tabDragging || !tabsRef.current) return;
    const dx = e.clientX - tabDragStart.current.x;
    tabsRef.current.scrollLeft = tabDragStart.current.scrollLeft - dx;
  }, [tabDragging]);
  const handleTabDragEnd = useCallback(() => setTabDragging(false), []);

  const handleSplitterDown = useCallback((e: React.MouseEvent) => {
    setSplitting(true);
    splitterStart.current = { x: e.clientX, leftWidth: (splitViewRef.current?.querySelector('.library-main-panel') as HTMLElement)?.offsetWidth || 400 };
    e.preventDefault();
  }, []);
  const handleSplitterMove = useCallback((e: MouseEvent) => {
    if (!splitting || !splitViewRef.current) return;
    const dx = e.clientX - splitterStart.current.x;
    const newLeft = Math.max(250, Math.min(800, splitterStart.current.leftWidth + dx));
    const leftPanel = splitViewRef.current.querySelector('.library-main-panel') as HTMLElement;
    if (leftPanel) leftPanel.style.width = `${newLeft}px`;
  }, [splitting]);
  const handleSplitterUp = useCallback(() => setSplitting(false), []);
  useEffect(() => {
    if (splitting) {
      window.addEventListener('mousemove', handleSplitterMove);
      window.addEventListener('mouseup', handleSplitterUp);
      return () => {
        window.removeEventListener('mousemove', handleSplitterMove);
        window.removeEventListener('mouseup', handleSplitterUp);
      };
    }
  }, [splitting, handleSplitterMove, handleSplitterUp]);

  return (
    <div className={`library-split-view${splitting ? ' splitting' : ''}`} ref={splitViewRef}>
      {/* Left panel: Paper list */}
      <div className="library-main-panel">
        {/* Import section */}
        {showImport ? (
          <div className="library-import-section">
            <div className="library-import-header">
              <h3><IconUpload size={18} style={{ marginRight: 6 }} /> Tải lên</h3>
              <button className="library-import-close" onClick={() => setShowImport(false)}>✕</button>
            </div>
            <ImportPanel
              onImported={() => {
                loadPapers();
                setShowImport(false);
              }}
            />
          </div>
        ) : (
          <div className="library-header-new">
            {/* Row 1: Title and sync/upload buttons */}
            <div className="library-title-row">
              <div className="library-title-left">
                <h2 className="library-title">
                  <IconLibrary size={20} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 8 }} />
                  Thư viện
                </h2>
                <span className="library-badge">{total} paper{total !== 1 ? 's' : ''}</span>
              </div>
              <div className="library-header-actions-group">
                <button 
                  className={`library-icon-btn zotero-sync-btn ${syncingZotero ? "syncing" : ""}`}
                  onClick={handleZoteroSync} 
                  disabled={syncingZotero}
                  title={syncingZotero ? "Đang đồng bộ..." : "Đồng bộ Zotero"}
                >
                  {syncingZotero ? <IconSpinner size={14} /> : <IconRefresh size={14} />}
                </button>
                <button 
                  className="library-primary-btn" 
                  onClick={() => setShowImport(true)}
                  title="Tải lên tài liệu"
                >
                  <IconUpload size={14} />
                  <span>Tải lên</span>
                </button>
              </div>
            </div>

            {/* Row 2 (Conditional): Bulk actions */}
            {selected.size > 0 && (
              <div className="library-bulk-row">
                <span className="bulk-selection-count">Đã chọn {selected.size}</span>
                <div className="bulk-actions-group">
                  <button className="library-bulk-action-btn primary" onClick={() => onStartChat(Array.from(selected))}>
                    <IconChat size={13} style={{ marginRight: 4 }} />
                    <span>Chat</span>
                  </button>
                  {onStartVerify && (
                    <button className="library-bulk-action-btn" onClick={() => onStartVerify(Array.from(selected))}>
                      <IconSearch size={13} style={{ marginRight: 4 }} />
                      <span>Xác thực</span>
                    </button>
                  )}
                  {collections.length > 0 && (
                    <div className="library-collection-add-group">
                      <select
                        className="library-inline-select"
                        value={targetCollectionId}
                        onChange={(e) => setTargetCollectionId(e.target.value)}
                      >
                        <option value="">Thêm vào Project...</option>
                        {collections.map((collection) => (
                          <option key={collection.id} value={collection.id}>{collection.name}</option>
                        ))}
                      </select>
                      <button className="library-inline-btn" onClick={addSelectedToCollection} disabled={!targetCollectionId}>
                        Thêm
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Row 3: Search box and filter selectors */}
            <div className="library-toolbar-row">
              <div className="library-search-box">
                <IconSearch size={13} className="search-icon" />
                <input
                  type="text"
                  placeholder="Tìm kiếm tài liệu..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="library-search-input"
                />
                {searchQuery && (
                  <button className="search-clear-btn" onClick={() => setSearchQuery("")}>✕</button>
                )}
              </div>
              <div className="library-filters-dropdowns">
                <select
                  className="library-toolbar-select"
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value); setPage(1); }}
                  title="Lọc trạng thái"
                >
                  <option value="all">Tất cả</option>
                  <option value="indexed">Đã index</option>
                  <option value="starred">Yêu thích</option>
                  <option value="unread">Chưa đọc</option>
                  <option value="reading">Đang đọc</option>
                  <option value="read">Đã đọc</option>
                </select>
                <select
                  className="library-toolbar-select project-select"
                  value={activeCollectionId}
                  onChange={(e) => { setActiveCollectionId(e.target.value); setPage(1); setSelected(new Set()); }}
                  title="Project/Collection"
                >
                  <option value="">Projects</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name} ({collection.paper_count})
                    </option>
                  ))}
                </select>
                <button className="library-add-project-btn" onClick={createCollection} title="Tạo Project mới">
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Paper list container */}
        {loading ? (
          <div style={{ padding: "8px 16px" }}>
            <ListSkeleton count={6} />
          </div>
        ) : papers.length === 0 ? (
          <div className="library-empty">
            <IconBrain size={48} className="icon-gradient" />
            <h3>Chưa có tài liệu nào</h3>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "16px" }}>
              <button className="library-import-btn library-empty-import" onClick={() => setShowImport(true)}>
                <IconUpload size={16} style={{ marginRight: 4 }} />
                Thêm tài liệu
              </button>
              <button 
                className="library-secondary-btn" 
                onClick={handleZoteroSync}
                disabled={syncingZotero}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {syncingZotero ? <IconSpinner size={16} /> : <IconRefresh size={16} />}
                <span>{syncingZotero ? "Đang đồng bộ..." : "Đồng bộ Zotero"}</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className="library-list"
            ref={listRef}
            onScroll={(e) => setListScrollTop(e.currentTarget.scrollTop)}
            style={{ position: "relative", overflowY: "auto" }}
          >
            <div style={{ height: virtualHeight, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, transform: `translateY(${virtualTop}px)` }}>
            {virtualPapers.map((p) => (
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
                    {/* <span className="library-card-status" title={p.read_status === "read" ? "Đã đọc" : p.read_status === "reading" ? "Đang đọc" : "Chưa đọc"}>
                      {renderStatusIcon(p.read_status)}
                    </span> */}
                  </div>
                  <div className="library-card-meta">
                    {p.authors && p.authors !== "[]" && (
                      <span>{p.authors.replace(/[\[\]"']/g, "")} · </span>
                    )}
                    {p.year && <span>{p.year} · </span>}
                    <span>{p.language.toUpperCase()} · </span>
                    <span>{p.page_count || "?"} trang</span>
                    {p.is_scanned && <span className="library-mini-badge warning">PDF scan</span>}
                    {p.status === "needs_ocr" && <span className="library-mini-badge danger">Cần OCR</span>}
                  </div>
                </div>
                <div className="library-card-actions" onClick={(e) => e.stopPropagation()}>
                  {p.status === "needs_ocr" && (
                    <button className="library-action-btn" onClick={() => retryOcr(p)} title="Chạy OCR lại">
                      <IconRefresh size={16} />
                    </button>
                  )}
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
            </div>
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

      {/* Splitter */}
      <div
        className="library-splitter"
        onMouseDown={handleSplitterDown}
      />
      {/* Right panel: Zotero-style preview panel */}
      <div className="library-preview-panel" ref={previewPanelRef}>
        {activePaper ? (
          <>
            <div className="preview-header">
              <h3 className="preview-title" title={activePaper.title || activePaper.filename}>
                {activePaper.title || activePaper.filename}
              </h3>
               {panelNarrow ? (
                <div className="preview-actions-narrow">
                  {onStartWow && (
                    <button className="preview-btn wow-glow-btn" onClick={() => onStartWow(activePaper.id)}
                      style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <IconSparkle size={14} />
                      <span>Phân tích AI</span>
                    </button>
                  )}
                  <button className="preview-btn" onClick={() => onStartChat([activePaper.id])}
                    style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <IconChat size={14} />
                    <span>Hỏi AI</span>
                  </button>
                  <div style={{ position: "relative" }}>
                    <button className="preview-btn" onClick={(e) => { e.stopPropagation(); setShowNarrowMenu(!showNarrowMenu); }} title="Thao tác"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>⋮</span>
                    </button>
                    {showNarrowMenu && (
                      <div className="narrow-actions-menu" onMouseDown={(e) => e.stopPropagation()}>
                        {onStartDebate && (
                          <button className="narrow-action-btn" onClick={() => { onStartDebate([activePaper.id]); setShowNarrowMenu(false); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                            <IconBulb size={13} />
                            <span>Tranh luận</span>
                          </button>
                        )}
                        <button className="narrow-action-btn" onClick={() => { toggleReadStatus(activePaper.id, activePaper.read_status); setShowNarrowMenu(false); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          {renderStatusIcon(activePaper.read_status, 13)}
                          <span>{activePaper.read_status === "read" ? "Đã đọc" : activePaper.read_status === "reading" ? "Đang đọc" : "Chưa đọc"}</span>
                        </button>
                        <button className="narrow-action-btn" onClick={() => { toggleStar(activePaper.id, activePaper.starred); setShowNarrowMenu(false); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <IconStar size={13} className={activePaper.starred ? "starred" : ""} />
                          <span>{activePaper.starred ? "Đã thích" : "Yêu thích"}</span>
                        </button>
                        <div className="narrow-menu-divider" />
                        <button className="narrow-action-btn" onClick={() => { handleExportHtml(activePaper.id); setShowNarrowMenu(false); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <IconLink size={13} />
                          <span>Export HTML</span>
                        </button>
                        <button className="narrow-action-btn" onClick={() => { handleExportDocx(activePaper.id); setShowNarrowMenu(false); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <IconFileText size={13} />
                          <span>Export DOCX</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="preview-actions">
                  {onStartWow && (
                    <button
                      className="preview-btn wow-glow-btn"
                      onClick={() => onStartWow(activePaper.id)}
                    >
                      <IconSparkle size={14} />
                      <span>Phân tích</span>
                    </button>
                  )}
                  <button
                    className="preview-btn"
                    onClick={() => onStartChat([activePaper.id])}
                  >
                    <IconChat size={14} />
                    <span>Hỏi AI</span>
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

                  {/* Export dropdown */}
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <button
                      className="preview-btn"
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      onBlur={() => setTimeout(() => setShowExportMenu(false), 200)}
                      disabled={exportingId === activePaper.id}
                      title="Export paper"
                    >
                      {exportingId === activePaper.id ? (
                        <IconSpinner size={14} />
                      ) : (
                        <IconDownload size={14} />
                      )}
                      <span>Export</span>
                    </button>
                    {showExportMenu && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          right: 0,
                          marginTop: 4,
                          background: "var(--color-bg, #fff)",
                          border: "1px solid var(--color-border, #e5e7eb)",
                          borderRadius: 8,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                          zIndex: 1000,
                          minWidth: 170,
                          overflow: "hidden",
                        }}
                      >
                        <button
                          onClick={() => { handleExportHtml(activePaper.id); setShowExportMenu(false); }}
                          style={menuItemStyle}
                          onMouseEnter={highlightOn}
                          onMouseLeave={highlightOff}
                        >
                          <IconLink size={13} style={{ marginRight: 6 }} /> Export HTML
                        </button>
                        <button
                          onClick={() => { handleExportDocx(activePaper.id); setShowExportMenu(false); }}
                          style={menuItemStyle}
                          onMouseEnter={highlightOn}
                          onMouseLeave={highlightOff}
                        >
                          <IconFileText size={13} style={{ marginRight: 6 }} /> Export DOCX
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {panelNarrow ? (
              <div className="preview-tabs-compact">
                <select
                  className="preview-tabs-select"
                  value={previewTab}
                  onChange={(e) => setPreviewTab(e.target.value as typeof previewTab)}
                >
                  <option value="info">Tóm tắt & Thông tin</option>
                  <option value="ai">Phân tích AI</option>
                  <option value="related">Papers liên quan</option>
                  <option value="highlights">Đoạn quan trọng</option>
                  <option value="pdf">Đọc tài liệu</option>
                </select>
              </div>
            ) : (
              <div
                className="preview-tabs"
                ref={tabsRef}
                onMouseDown={handleTabDragStart}
                onMouseMove={handleTabDragMove}
                onMouseUp={handleTabDragEnd}
                onMouseLeave={handleTabDragEnd}
              >
                <button
                  className={`preview-tab-btn ${previewTab === "info" ? "active" : ""}`}
                  onClick={() => setPreviewTab("info")}
                >
                  <IconFileText size={14} style={{ marginRight: 6 }} /> Tóm tắt
                </button>
                <button
                  className={`preview-tab-btn ${previewTab === "ai" ? "active" : ""}`}
                  onClick={() => setPreviewTab("ai")}
                >
                  <IconSparkle size={14} style={{ marginRight: 6 }} /> Phân tích AI
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
                  <IconGraph size={14} style={{ marginRight: 6 }} /> Liên quan
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
                  <IconStar size={14} style={{ marginRight: 6 }} /> Đoạn Q.trọng
                </button>
                <button
                  className={`preview-tab-btn ${previewTab === "pdf" ? "active" : ""}`}
                  onClick={() => setPreviewTab("pdf")}
                >
                  <IconBookOpen size={14} style={{ marginRight: 6 }} /> Đọc tài liệu
                </button>
              </div>
            )}

            {previewTab === "info" ? (
              <div className="preview-body">
                {/* Auto Summary Section - Highlighted */}
                {activePaper.auto_summary && (
                  <div className="preview-summary-section">
                    <div className="preview-summary-header">
                      <span className="preview-summary-icon">
                        <IconSparkle size={15} style={{ color: "var(--color-primary)" }} />
                      </span>
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
                    <span className="preview-user-notes-icon">
                      <IconEdit size={15} style={{ color: "var(--color-primary)" }} />
                    </span>
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
                      {getIndexStatusLabel(activePaper.status)}
                    </span>
                  </div>
                  {(activePaper.is_scanned || activePaper.status === "needs_ocr") && (
                    <div className="metadata-item">
                      <span className="metadata-label">OCR</span>
                      <span className="metadata-value">
                        {activePaper.is_scanned
                          ? `Đã OCR ${activePaper.ocr_pages_count || 0} trang${activePaper.ocr_pages_failed ? `, lỗi ${activePaper.ocr_pages_failed}` : ""}`
                          : "Chưa có OCR metadata"}
                        <button
                          className="metadata-inline-btn"
                          onClick={() => retryOcr(activePaper)}
                          style={{ marginLeft: 8 }}
                        >
                          Chạy OCR lại
                        </button>
                      </span>
                    </div>
                  )}

                  {activePaper.layout_stats && (
                    <div className="metadata-item">
                      <span className="metadata-label">Bố cục</span>
                      <span className="metadata-value">
                        {(() => {
                          const stats = activePaper.layout_stats;
                          const pages = Object.keys(stats);
                          const colCounts = pages.map(p => stats[p].columns);
                          const avgCols = colCounts.reduce((a, b) => a + b, 0) / colCounts.length;
                          const multiPageCount = pages.filter(p => stats[p].multicolumn).length;
                          if (avgCols <= 1) return "1 cột";
                          return `${Math.round(avgCols * 10) / 10} cột (TB) · ${multiPageCount}/${pages.length} trang đa cột`;
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : previewTab === "related" ? (
              <div className="preview-body">
                <div className="related-papers-header">
                  <h4 className="related-papers-title" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <IconLink size={14} />
                    <span>Papers liên quan (theo embedding similarity)</span>
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
                  <h4 className="highlights-title" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <IconStar size={14} />
                    <span>Đoạn quan trọng được AI xác định</span>
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
                          <span className={`highlight-category highlight-cat-${h.category}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            {getCategoryIcon(h.category, 12)}
                            <span>{h.category === "key_finding" ? "Kết quả chính"
                              : h.category === "methodology" ? "Phương pháp"
                              : h.category === "conclusion" ? "Kết luận"
                              : h.category === "novel_contribution" ? "Đóng góp mới"
                              : h.category === "limitation" ? "Hạn chế"
                              : "Khái niệm quan trọng"}</span>
                          </span>
                          {h.page_hint && (
                            <span className="highlight-page">Trang {h.page_hint}</span>
                          )}
                          <span className={`highlight-importance badge-${h.importance}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span className={`importance-dot ${h.importance}`} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: h.importance === "high" ? "var(--color-danger, #ef4444)" : "var(--color-warning, #f59e0b)" }} />
                            <span>{h.importance === "high" ? "Quan trọng" : "Trung bình"}</span>
                          </span>
                        </div>
                        <blockquote className="highlight-text">
                          "{h.text}"
                        </blockquote>
                        <div className="highlight-note" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <IconChat size={12} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                          <span>{h.note}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : previewTab === "ai" ? (
              <div className="preview-body">
                <div className="preview-ai-actions">
                  <h4 style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <IconSparkle size={16} />
                    <span>Phân tích tài liệu AI</span>
                  </h4>
                  <button
                    className="preview-ai-btn"
                    onClick={() => onStartReview([activePaper.id])}
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                  >
                    <IconFileText size={14} />
                    <span>Review tự động</span>
                  </button>
                  <button
                    className="preview-ai-btn"
                    onClick={() => onStartCritique([activePaper.id])}
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                  >
                    <IconSearch size={14} />
                    <span>Phê bình</span>
                  </button>
                  {onStartDebate && (
                    <button
                      className="preview-ai-btn"
                      onClick={() => onStartDebate([activePaper.id])}
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                    >
                      <IconBulb size={14} />
                      <span>Tranh luận AI</span>
                    </button>
                  )}
                  {onStartWow && (
                    <button
                      className="preview-ai-btn"
                      onClick={() => onStartWow(activePaper.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                    >
                      <IconSparkle size={14} />
                      <span>Wow Analysis</span>
                    </button>
                  )}
                  <button
                    className="preview-ai-btn"
                    onClick={() => onStartChat([activePaper.id])}
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                  >
                    <IconChat size={14} />
                    <span>Hỏi AI về paper này</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="pdf-iframe-container">
                <iframe
                  src={`${BASE_URL}/api/papers/${activePaper.id}/file`}
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
            <p>Chọn một tài liệu trong danh sách bên trái để xem thông tin chi tiết và đọc nội dung tài liệu.</p>
          </div>
        )}
      </div>
    </div>
  );
};
