import React, { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { api, Collection, Paper, RelatedPaper, Highlight, ChunkMatch, BASE_URL } from "../../lib/api";
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


const getIndexStatusLabel = (status: string, t: (key: string) => string) => {
  if (status === "indexed") return t("library_view.status_extracted");
  if (status === "needs_ocr") return t("library_view.status_need_ocr");
  if (status === "failed") return t("library_view.status_failed");
  if (status === "summarizing") return t("library_view.status_summarizing");
  if (status === "indexing") return t("library_view.status_indexing");
  return status || t("library_view.status_unknown");
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
  const { t } = useTranslation();
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
  const [relatedModelInfo, setRelatedModelInfo] = useState<{ name: string; mode: string } | null>(null);

  // Chunk match modal state
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchModalData, setMatchModalData] = useState<{
    sourceTitle: string;
    otherTitle: string;
    similarity: number;
    matches: ChunkMatch[];
    modelInfo: { name: string; mode: string } | null;
  } | null>(null);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // PDF preview modal for related papers
  const [pdfPreviewId, setPdfPreviewId] = useState<string | null>(null);

  // Summary regeneration state
  const [regeneratingSummary, setRegeneratingSummary] = useState(false);

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
        t("library_view.toast_zotero_sync", { imported: res.imported, pdf: res.pdf_imported, duplicates: res.duplicates })
      );
    } catch (e: any) {
      console.error("Zotero sync failed:", e);        toast.addToast("error", t("library_view.toast_zotero_error", { msg: e.message || e }));
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

  // Auto-regenerate summary when language changes and summary language mismatches
  useEffect(() => {
    if (!activePaper) return;
    if (!activePaper.auto_summary) return;
    if (regeneratingSummary) return;
    const currentLang = i18n.language?.split("-")[0] || "vi";
    const summaryLang = activePaper.auto_summary_lang || "vi";
    if (currentLang === summaryLang) return;
    setRegeneratingSummary(true);
    api.regenerateSummary(activePaper.id).then((res) => {
      setActivePaper((prev) => prev ? { ...prev, auto_summary: res.auto_summary, auto_summary_lang: res.auto_summary_lang } : prev);
      setPapers((prev) => prev.map((p) => p.id === activePaper.id ? { ...p, auto_summary: res.auto_summary, auto_summary_lang: res.auto_summary_lang } : p));
    }).catch((e) => {
      console.error("Failed to regenerate summary:", e);
    }).finally(() => {
      setRegeneratingSummary(false);
    });
  }, [activePaper?.id, activePaper?.auto_summary_lang, i18n.language]);

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
    if (!confirm(t("library_view.confirm_delete"))) return;
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
    const name = prompt(t("library_view.prompt_collection_name"));
    if (!name?.trim()) return;
    try {
      const collection = await api.createCollection(name.trim());
      setCollections((prev) => [...prev, collection]);
      setActiveCollectionId(collection.id);
      toast.addToast("success", t("library_view.toast_created"));
    } catch (e) {
      console.error("Failed to create collection:", e);
      toast.addToast("error", t("library_view.toast_create_error"));
    }
  };

  const addSelectedToCollection = async () => {
    if (!targetCollectionId || selected.size === 0) return;
    try {
      const res = await api.addPapersToCollection(targetCollectionId, Array.from(selected));
      toast.addToast("success", t("library_view.toast_added", { n: res.added }));
      setSelected(new Set());
      loadCollections();
      loadPapers();
    } catch (e) {
      console.error("Failed to add papers to collection:", e);
      toast.addToast("error", t("library_view.toast_add_error"));
    }
  };

  const retryOcr = async (paper: Paper) => {
    try {
      await api.retryPaperOcr(paper.id);
      toast.addToast("success", t("library_view.toast_ocr_queued"));
      loadPapers();
    } catch (e) {
      console.error("Failed to retry OCR:", e);
      toast.addToast("error", t("library_view.toast_ocr_error"));
    }
  };

  const saveNotes = async () => {
    if (!activePaper) return;
    setSavingNotes(true);
    try {
      const updated = await api.updatePaper(activePaper.id, { notes } as Partial<Paper>);
      setPapers((prev) => prev.map((p) => (p.id === activePaper.id ? updated : p)));
      setActivePaper(updated);
      toast.addToast("success", t("library_view.toast_note_saved"));
    } catch (e) {
      console.error("Failed to save notes:", e);
      toast.addToast("error", t("library_view.toast_note_error"));
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
    setRelatedModelInfo(null);
    try {
      const res = await api.findRelatedPapers(paperId, 5);
      if (activePaperIdRef.current !== paperId) return;
      setRelatedPapers(res.related_papers);
      setRelatedModelInfo(res.model_info || null);
    } catch (e) {
      if (activePaperIdRef.current !== paperId) return;
      console.error("Failed to load related papers:", e);
      setRelatedPapers([]);
    } finally {
      if (activePaperIdRef.current === paperId) setLoadingRelated(false);
    }
  };

  const showRelatedPaperMatches = async (otherPaperId: string, similarity: number, otherTitle: string) => {
    if (!activePaper) return;
    setLoadingMatches(true);
    setMatchModalOpen(true);
    setMatchModalData(null);
    try {
      const res = await api.getRelatedPaperMatches(activePaper.id, otherPaperId, 10);
      setMatchModalData({
        sourceTitle: activePaper.title || activePaper.filename,
        otherTitle: otherTitle || res.other_paper_title,
        similarity,
        matches: res.matches,
        modelInfo: res.model_info || null,
      });
    } catch (e) {
      console.error("Failed to load matching chunks:", e);
      setMatchModalData(null);
    } finally {
      setLoadingMatches(false);
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
      toast.addToast("error", t("library_view.toast_export_html_error"));
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
      toast.addToast("error", t("library_view.toast_export_docx_error"));
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
              <h3><IconUpload size={18} style={{ marginRight: 6 }} /> {t("library_view.upload_section")}</h3>
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
                  {t("library_view.title")}
                </h2>
                <span className="library-badge">{total} paper{total !== 1 ? 's' : ''}</span>
              </div>
              <div className="library-header-actions-group">
                <button 
                  className={`library-icon-btn zotero-sync-btn ${syncingZotero ? "syncing" : ""}`}
                  onClick={handleZoteroSync} 
                  disabled={syncingZotero}
                  title={syncingZotero ? t("library_view.zotero_syncing") : t("library_view.zotero_sync")}
                >
                  {syncingZotero ? <IconSpinner size={14} /> : <IconRefresh size={14} />}
                </button>
                <button 
                  className="library-primary-btn" 
                  onClick={() => setShowImport(true)}
                  title={t("library_view.upload_title")}
                >
                  <IconUpload size={14} />
                  <span>{t("library_view.upload_btn")}</span>
                </button>
              </div>
            </div>

            {/* Row 2 (Conditional): Bulk actions */}
            {selected.size > 0 && (
              <div className="library-bulk-row">
                <span className="bulk-selection-count">{t("library_view.bulk_selected", { n: selected.size })}</span>
                <div className="bulk-actions-group">
                  <button className="library-bulk-action-btn primary" onClick={() => onStartChat(Array.from(selected))}>
                    <IconChat size={13} style={{ marginRight: 4 }} />
                    <span>{t("library_view.bulk_chat")}</span>
                  </button>
                  {onStartVerify && (
                    <button className="library-bulk-action-btn" onClick={() => onStartVerify(Array.from(selected))}>
                      <IconSearch size={13} style={{ marginRight: 4 }} />
                      <span>{t("library_view.bulk_verify")}</span>
                    </button>
                  )}
                  {collections.length > 0 && (
                    <div className="library-collection-add-group">
                      <select
                        className="library-inline-select"
                        value={targetCollectionId}
                        onChange={(e) => setTargetCollectionId(e.target.value)}
                      >
                        <option value="">{t("library_view.bulk_add_project")}</option>
                        {collections.map((collection) => (
                          <option key={collection.id} value={collection.id}>{collection.name}</option>
                        ))}
                      </select>
                      <button className="library-inline-btn" onClick={addSelectedToCollection} disabled={!targetCollectionId}>
                        {t("library_view.bulk_add")}
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
                  placeholder={t("library_view.search")}
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
                  title={t("library_view.filter_status_title")}
                >
                  <option value="all">{t("library_view.filter_all")}</option>
                  <option value="indexed">{t("library_view.filter_indexed")}</option>
                  <option value="starred">{t("library_view.filter_favorites")}</option>
                  <option value="unread">{t("library_view.filter_unread")}</option>
                  <option value="reading">{t("library_view.filter_reading")}</option>
                  <option value="read">{t("library_view.filter_read")}</option>
                </select>
                <select
                  className="library-toolbar-select project-select"
                  value={activeCollectionId}
                  onChange={(e) => { setActiveCollectionId(e.target.value); setPage(1); setSelected(new Set()); }}
                  title={t("library_view.project_collection_title")}
                >
                  <option value="">{t("library_view.projects_select")}</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name} ({collection.paper_count})
                    </option>
                  ))}
                </select>
                <button className="library-add-project-btn" onClick={createCollection} title={t("library_view.new_project")}>
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
            <h3>{t("library_view.empty_library")}</h3>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "16px" }}>
              <button className="library-import-btn library-empty-import" onClick={() => setShowImport(true)}>
                <IconUpload size={16} style={{ marginRight: 4 }} />
                {t("library_view.add_doc")}
              </button>
              <button 
                className="library-secondary-btn" 
                onClick={handleZoteroSync}
                disabled={syncingZotero}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {syncingZotero ? <IconSpinner size={16} /> : <IconRefresh size={16} />}
                <span>{syncingZotero ? t("library_view.zotero_syncing") : t("library_view.zotero_sync")}</span>
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
                  </div>
                  <div className="library-card-meta">
                    {p.authors && p.authors !== "[]" && (
                      <span>{p.authors.replace(/[\[\]"']/g, "")} · </span>
                    )}
                    {p.year && <span>{p.year} · </span>}
                    <span>{p.language.toUpperCase()} · </span>
                    <span>{p.page_count || "?"} {t("library_view.page_unit")}</span>
                    {p.is_scanned && <span className="library-mini-badge warning">{t("library_view.badge_scan")}</span>}
                    {p.status === "needs_ocr" && <span className="library-mini-badge danger">{t("library_view.badge_ocr")}</span>}
                  </div>
                </div>
                <div className="library-card-actions" onClick={(e) => e.stopPropagation()}>
                  {p.status === "needs_ocr" && (
                    <button className="library-action-btn" onClick={() => retryOcr(p)} title={t("library_view.run_ocr")}>
                      <IconRefresh size={16} />
                    </button>
                  )}
                  <button className="library-action-btn" onClick={() => toggleReadStatus(p.id, p.read_status)} title={t("library_view.toggle_read_status")}>
                    {renderStatusIcon(p.read_status)}
                  </button>
                  <button className="library-action-btn" onClick={() => toggleStar(p.id, p.starred)} title={t("library_view.favorite")}>
                    <IconStar size={16} className={p.starred ? "starred" : ""} />
                  </button>
                  <button className="library-action-btn danger" onClick={() => deletePaper(p.id)} title={t("library_view.delete")}>
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
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("library_view.pagination_prev")}</button>
            <span>{t("library_view.pagination_page", { n: page, m: totalPages })}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t("library_view.pagination_next")}</button>
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
                      <span>{t("library_view.ai_analyze")}</span>
                    </button>
                  )}
                  <button className="preview-btn" onClick={() => onStartChat([activePaper.id])}
                    style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <IconChat size={14} />
                    <span>{t("library_view.ai_chat")}</span>
                  </button>
                  <div style={{ position: "relative" }}>
                    <button className="preview-btn" onClick={(e) => { e.stopPropagation(); setShowNarrowMenu(!showNarrowMenu); }} title={t("library_view.actions")}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>⋮</span>
                    </button>
                    {showNarrowMenu && (
                      <div className="narrow-actions-menu" onMouseDown={(e) => e.stopPropagation()}>
                        {onStartDebate && (
                          <button className="narrow-action-btn" onClick={() => { onStartDebate([activePaper.id]); setShowNarrowMenu(false); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                            <IconBulb size={13} />
                            <span>{t("library_view.debate")}</span>
                          </button>
                        )}
                        <button className="narrow-action-btn" onClick={() => { toggleReadStatus(activePaper.id, activePaper.read_status); setShowNarrowMenu(false); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          {renderStatusIcon(activePaper.read_status, 13)}
                          <span>{activePaper.read_status === "read" ? t("library_view.filter_read") : activePaper.read_status === "reading" ? t("library_view.filter_reading") : t("library_view.filter_unread")}</span>
                        </button>
                        <button className="narrow-action-btn" onClick={() => { toggleStar(activePaper.id, activePaper.starred); setShowNarrowMenu(false); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <IconStar size={13} className={activePaper.starred ? "starred" : ""} />
                          <span>{activePaper.starred ? t("library_view.favorite") : t("library_view.favorite")}</span>
                        </button>
                        <div className="narrow-menu-divider" />
                        <button className="narrow-action-btn" onClick={() => { handleExportHtml(activePaper.id); setShowNarrowMenu(false); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <IconLink size={13} />
                          <span>{t("library_view.export_html")}</span>
                        </button>
                        <button className="narrow-action-btn" onClick={() => { handleExportDocx(activePaper.id); setShowNarrowMenu(false); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <IconFileText size={13} />
                          <span>{t("library_view.export_docx")}</span>
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
                      <span>{t("library_view.ai_analyze")}</span>
                    </button>
                  )}
                  <button
                    className="preview-btn"
                    onClick={() => onStartChat([activePaper.id])}
                  >
                    <IconChat size={14} />
                    <span>{t("library_view.ai_chat")}</span>
                  </button>
                  {onStartDebate && (
                    <button
                      className="preview-btn"
                      onClick={() => onStartDebate([activePaper.id])}
                    >
                      <IconBulb size={14} />
                      <span>{t("library_view.debate")}</span>
                    </button>
                  )}
                  <button
                    className="preview-btn"
                    onClick={() => toggleReadStatus(activePaper.id, activePaper.read_status)}
                  >
                    {renderStatusIcon(activePaper.read_status, 14)}
                    <span>
                      {activePaper.read_status === "read"
                        ? t("library_view.filter_read")
                        : activePaper.read_status === "reading"
                        ? t("library_view.filter_reading")
                        : t("library_view.filter_unread")}
                    </span>
                  </button>
                  <button
                    className="preview-btn"
                    onClick={() => toggleStar(activePaper.id, activePaper.starred)}
                  >
                    <IconStar size={14} className={activePaper.starred ? "starred" : ""} />
                    <span>{t("library_view.favorite")}</span>
                  </button>

                  {/* Export dropdown */}
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <button
                      className="preview-btn"
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      onBlur={() => setTimeout(() => setShowExportMenu(false), 200)}
                      disabled={exportingId === activePaper.id}
                      title={t("library_view.export_paper")}
                    >
                      {exportingId === activePaper.id ? (
                        <IconSpinner size={14} />
                      ) : (
                        <IconDownload size={14} />
                      )}
                      <span>{t("common.export")}</span>
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
                          <IconLink size={13} style={{ marginRight: 6 }} /> {t("library_view.export_html")}
                        </button>
                        <button
                          onClick={() => { handleExportDocx(activePaper.id); setShowExportMenu(false); }}
                          style={menuItemStyle}
                          onMouseEnter={highlightOn}
                          onMouseLeave={highlightOff}
                        >
                          <IconFileText size={13} style={{ marginRight: 6 }} /> {t("library_view.export_docx")}
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
                  <option value="info">{t("library_view.summary_tab_info")}</option>
                  <option value="ai">{t("library_view.analysis_tab")}</option>
                  <option value="related">{t("library_view.related_tab")}</option>
                  <option value="highlights">{t("library_view.highlights_tab")}</option>
                  <option value="pdf">{t("library_view.read_tab")}</option>
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
                  <IconFileText size={14} style={{ marginRight: 6 }} /> {t("library_view.summary_tab")}
                </button>
                <button
                  className={`preview-tab-btn ${previewTab === "ai" ? "active" : ""}`}
                  onClick={() => setPreviewTab("ai")}
                >
                  <IconSparkle size={14} style={{ marginRight: 6 }} /> {t("library_view.analysis_tab_with_icon")}
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
                  <IconGraph size={14} style={{ marginRight: 6 }} /> {t("library_view.related_tab")}
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
                  <IconStar size={14} style={{ marginRight: 6 }} /> {t("library_view.highlights_tab")}
                </button>
                <button
                  className={`preview-tab-btn ${previewTab === "pdf" ? "active" : ""}`}
                  onClick={() => setPreviewTab("pdf")}
                >
                  <IconBookOpen size={14} style={{ marginRight: 6 }} /> {t("library_view.read_tab")}
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
                      <span className="preview-summary-label">{t("library_view.summary_label")}</span>
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
                    <span className="preview-user-notes-label">{t("library_view.notes_label")}</span>
                  </div>
                  <textarea
                    className="notes-textarea"
                    placeholder={t("library_view.notes_placeholder")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <button
                    className="notes-save-btn"
                    onClick={saveNotes}
                    disabled={savingNotes}
                  >
                    {savingNotes ? t("library_view.saving_note") : t("library_view.save_note")}
                  </button>
                </div>

                <div className="metadata-grid">
  

                  <div className="metadata-item">
                    <span className="metadata-label">{t("library_view.tags_label")}</span>
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
                              placeholder={t("library_view.tag_placeholder")}
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddTag();
                                if (e.key === "Escape") setShowTagInput(false);
                              }}
                              autoFocus
                            />
                            <button className="tag-add-btn" onClick={handleAddTag}>{t("library_view.tag_add")}</button>
                          </div>
                        ) : (
                          <button className="tag-add-btn" onClick={() => setShowTagInput(true)}>{t("library_view.tag_add_btn")}</button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">{t("library_view.author_label")}</span>
                    <span className="metadata-value">
                      {activePaper.authors && activePaper.authors !== "[]"
                        ? activePaper.authors.replace(/[\[\]"']/g, "")
                        : t("library_view.info_missing")}
                    </span>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">{t("library_view.year_label")}</span>
                    <span className="metadata-value">{activePaper.year || t("library_view.info_missing")}</span>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">{t("library_view.filename_label")}</span>
                    <span className="metadata-value" style={{ wordBreak: "break-all" }}>{activePaper.filename}</span>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">{t("library_view.filesize_label")}</span>
                    <span className="metadata-value">{(activePaper.file_size / 1024).toFixed(0)} KB</span>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">{t("library_view.index_status_label")}</span>
                    <span className="metadata-value">
                      {getIndexStatusLabel(activePaper.status, t)}
                    </span>
                  </div>
                  {(activePaper.is_scanned || activePaper.status === "needs_ocr") && (
                    <div className="metadata-item">
                      <span className="metadata-label">OCR</span>
                      <span className="metadata-value">
                        {activePaper.is_scanned
                          ? t("library_view.ocr_status", { n: activePaper.ocr_pages_count || 0, m: activePaper.ocr_pages_failed || 0 })
                          : t("library_view.ocr_no_metadata")}
                        <button
                          className="metadata-inline-btn"
                          onClick={() => retryOcr(activePaper)}
                          style={{ marginLeft: 8 }}
                        >
                          {t("library_view.run_ocr")}
                        </button>
                      </span>
                    </div>
                  )}

                  {activePaper.layout_stats && (
                    <div className="metadata-item">
                      <span className="metadata-label">{t("library_view.layout_label")}</span>
                      <span className="metadata-value">
                        {(() => {
                          const stats = activePaper.layout_stats;
                          const pages = Object.keys(stats);
                          const colCounts = pages.map(p => stats[p].columns);
                          const avgCols = colCounts.reduce((a, b) => a + b, 0) / colCounts.length;
                          const multiPageCount = pages.filter(p => stats[p].multicolumn).length;
                          if (avgCols <= 1) return t("library_view.layout_single");
                          return t("library_view.layout_multi", { avg: Math.round(avgCols * 10) / 10, multi: multiPageCount, total: pages.length });
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
                    <IconLink size={14} />                      <span>{t("library_view.related_tab_subtitle")}</span>
                  </h4>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {relatedModelInfo && (
                      <span className="related-model-badge" title={`Model: ${relatedModelInfo.name} · Mode: ${relatedModelInfo.mode}`}>
                        {relatedModelInfo.name.split("/").pop()} ({relatedModelInfo.mode})
                      </span>
                    )}
                    {relatedPapers.length > 0 && (
                      <button
                        className="related-papers-detail-btn"
                        onClick={() => {
                          const top = relatedPapers[0];
                          showRelatedPaperMatches(top.paper_id, top.similarity, top.title);
                        }}
                        title={t("library_view.view_similarity_title")}
                      >
                        <IconSearch size={12} />
                        <span>{t("library_view.view_similarity_title")}</span>
                      </button>
                    )}
                    <button
                      className="related-papers-refresh-btn"
                      onClick={() => activePaper && loadRelatedPapers(activePaper.id)}
                      disabled={loadingRelated}
                  >
                    {loadingRelated ? t("common.loading") : t("common.retry")}
                  </button>
                  </div>
                </div>

                {loadingRelated ? (
                  <div className="related-papers-loading">
                    <div className="insights-loading-spinner" />
                    <span>{t("library_view.loading_related")}</span>
                  </div>
                ) : relatedPapers.length === 0 ? (
                  <div className="related-papers-empty">
                    <p>{t("library_view.no_related")}</p>
                    <p className="hint">{t("library_view.no_related_hint")}</p>
                  </div>
                ) : (
                  <div className="related-papers-list">
                    {relatedPapers.map((rp) => (
                      <div
                        key={rp.paper_id}
                        className="related-paper-card"
                        onClick={() => setPdfPreviewId(rp.paper_id)}
                      >
                        <div className="related-paper-score">
                          <span className="related-paper-score-value">
                            {(rp.similarity * 100).toFixed(0)}%
                          </span>
                          <span className="related-paper-score-label">{t("library_view.similarity_label")}</span>
                        </div>
                        <div className="related-paper-content">
                          <div className="related-paper-title">{rp.title || t("search.no_title")}</div>
                          <div className="related-paper-snippet">{rp.snippet}...</div>
                          <div className="related-paper-meta">
                            {t("library_view.matching_chunks", { count: rp.matching_chunks })}
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
                    <span>{t("library_view.highlights_subtitle")}</span>
                  </h4>
                  <button
                    className="highlights-refresh-btn"
                    onClick={() => activePaper && loadHighlights(activePaper.id)}
                    disabled={loadingHighlights}
                  >
                    {loadingHighlights ? t("library_view.highlights_analyzing") : t("library_view.highlights_reanalyze")}
                  </button>
                </div>

                {loadingHighlights ? (
                  <div className="highlights-loading">
                    <div className="insights-loading-spinner" />
                    <span>{t("library_view.highlights_loading")}</span>
                    <span className="highlights-loading-hint">{t("library_view.highlights_loading_hint")}</span>
                  </div>
                ) : highlights.length === 0 ? (
                  <div className="highlights-empty">
                    <p>{t("library_view.highlights_empty")}</p>
                    <p className="hint">{t("library_view.highlights_empty_hint")}</p>
                  </div>
                ) : (
                  <div className="highlights-list">
                    {highlights.map((h, i) => (
                      <div key={i} className={`highlight-card ${h.importance === "high" ? "highlight-high" : "highlight-medium"}`}>
                        <div className="highlight-card-header">
                          <span className={`highlight-category highlight-cat-${h.category}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            {getCategoryIcon(h.category, 12)}
                            <span>{h.category === "key_finding" ? t("highlights.category_results")
                              : h.category === "methodology" ? t("highlights.category_methods")
                              : h.category === "conclusion" ? t("highlights.category_conclusions")
                              : h.category === "novel_contribution" ? t("highlights.category_contributions")
                              : h.category === "limitation" ? t("highlights.category_limitations")
                              : t("highlights.category_key_points")}</span>
                          </span>
                          {h.page_hint && (
                            <span className="highlight-page">{t("library_view.page_unit")} {h.page_hint}</span>
                          )}
                          <span className={`highlight-importance badge-${h.importance}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span className={`importance-dot ${h.importance}`} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: h.importance === "high" ? "var(--color-danger, #ef4444)" : "var(--color-warning, #f59e0b)" }} />
                            <span>{h.importance === "high" ? t("highlights.importance_high") : t("highlights.importance_medium")}</span>
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
                    <span>{t("library_view.ai_analyze")}</span>
                  </h4>
                  <button
                    className="preview-ai-btn"
                    onClick={() => onStartReview([activePaper.id])}
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                  >
                    <IconFileText size={14} />
                    <span>{t("library_view.ai_review")}</span>
                  </button>
                  <button
                    className="preview-ai-btn"
                    onClick={() => onStartCritique([activePaper.id])}
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                  >
                    <IconSearch size={14} />
                    <span>{t("library_view.ai_critique")}</span>
                  </button>
                  {onStartDebate && (
                    <button
                      className="preview-ai-btn"
                      onClick={() => onStartDebate([activePaper.id])}
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                    >
                      <IconBulb size={14} />
                      <span>{t("library_view.debate")}</span>
                    </button>
                  )}
                  {onStartWow && (
                    <button
                      className="preview-ai-btn"
                      onClick={() => onStartWow(activePaper.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                    >
                      <IconSparkle size={14} />
                      <span>{t("library_view.ai_wow")}</span>
                    </button>
                  )}
                  <button
                    className="preview-ai-btn"
                    onClick={() => onStartChat([activePaper.id])}
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                  >
                    <IconChat size={14} />
                    <span>{t("library_view.ai_chat")}</span>
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
            <h3>{t("library_view.no_doc_heading")}</h3>
            <p>{t("library_view.no_doc_text")}</p>
          </div>
        )}

        {/* Related paper matches modal */}
        {matchModalOpen && (
          <div className="rm-modal-overlay" onClick={() => setMatchModalOpen(false)}>
            <div className="rm-modal rm-modal-matches" onClick={(e) => e.stopPropagation()}>
              <div className="rm-modal-header">
                <h3 className="rm-modal-title">
                  <IconGraph size={16} style={{ marginRight: 8 }} />
                  {t("library_view.similarity_detail_title")}
                </h3>
                <button className="rm-modal-close" onClick={() => setMatchModalOpen(false)}>✕</button>
              </div>
              <div className="rm-modal-body">
                {loadingMatches ? (
                  <div className="matches-loading">
                    <div className="insights-loading-spinner" />
                    <span>{t("library_view.loading_matches")}</span>
                  </div>
                ) : matchModalData ? (
                  <>
                    <div className="matches-summary">
                      <div className="matches-papers">
                        <div className="matches-paper-title" title={matchModalData.sourceTitle}>
                          <IconFileText size={14} />
                          <span>{matchModalData.sourceTitle}</span>
                        </div>
                        <div className="matches-vs">
                          <IconGraph size={14} />
                          <span className="matches-similarity">{(matchModalData.similarity * 100).toFixed(0)}%</span>
                        </div>
                        <div className="matches-paper-title" title={matchModalData.otherTitle}>
                          <IconFileText size={14} />
                          <span>{matchModalData.otherTitle}</span>
                        </div>
                      </div>
                      {matchModalData.modelInfo && (
                        <div className="matches-model-info">
                          <IconSettings size={12} />
                          <span>Embedding model: <strong>{matchModalData.modelInfo.name}</strong> ({matchModalData.modelInfo.mode})</span>
                        </div>
                      )}
                    </div>
                    <div className="matches-divider" />
                    <div className="matches-list">
                      <div className="matches-list-header">
                        <span className="matches-list-title">{t("library_view.similar_chunks_title", { count: matchModalData.matches.length })}</span>
                      </div>
                      {matchModalData.matches.length === 0 ? (
                        <div className="matches-empty">{t("library_view.no_similar_chunks")}</div>
                      ) : (
                        matchModalData.matches.map((m, i) => (
                          <div key={m.chunk_id || i} className="match-chunk-card">
                            <div className="match-chunk-header">
                              <span className="match-chunk-score" style={{ color: m.similarity > 0.7 ? "var(--color-success, #22c55e)" : m.similarity > 0.5 ? "var(--color-warning, #eab308)" : "var(--color-text-muted)" }}>
                                {(m.similarity * 100).toFixed(1)}%
                              </span>
                              {m.page_number != null && (
                                <span className="match-chunk-page">{t("library_view.match_chunk_page", { page: m.page_number })}</span>
                              )}
                              {m.chunk_index != null && (
                                <span className="match-chunk-index">Chunk #{m.chunk_index}</span>
                              )}
                            </div>
                            <div className="match-chunk-content">"{m.content}"</div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="matches-empty">{t("library_view.similarity_load_error")}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PDF preview modal for related papers */}
        {pdfPreviewId && (
          <div className="rm-modal-overlay" onClick={() => setPdfPreviewId(null)}>
            <div className="rm-modal rm-modal-pdf" onClick={(e) => e.stopPropagation()}>
              <div className="rm-modal-header">
                <h3 className="rm-modal-title">
                  <IconBookOpen size={16} style={{ marginRight: 8 }} />
                  {papers.find(p => p.id === pdfPreviewId)?.title || t("library_view.view_document")}
                </h3>
                <button className="rm-modal-close" onClick={() => setPdfPreviewId(null)}>✕</button>
              </div>
              <div className="rm-modal-pdf-body">
                <iframe
                  src={`${BASE_URL}/api/papers/${pdfPreviewId}/file`}
                  className="pdf-iframe"
                  title={t("pdf.preview_title")}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};