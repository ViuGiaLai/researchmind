import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api, ImportJob } from "../../lib/api";
import {
  IconFileText,
  IconNotebookPen,
  IconFileCode,
  IconBookMarked,
  IconFileImage,
  IconInfo,
  IconWarning,
  IconEdit,
  IconScanSearch,
  IconCircle,
  IconWithText,
  IconSpinner,
  IconCheck,
  IconError,
  IconFolderOpen,
  IconUpload,
  IconLibrary,
  IconBook,
} from "../Icons";

const SUPPORTED_FORMATS = [
  { ext: ".pdf", label: "PDF", Icon: IconFileText },
  { ext: ".docx", label: "DOCX", Icon: IconNotebookPen },
  { ext: ".doc", label: "DOC", Icon: IconNotebookPen },
  { ext: ".txt", label: "TXT", Icon: IconFileText },
  { ext: ".md", label: "Markdown", Icon: IconBookMarked },
  { ext: ".html", label: "HTML", Icon: IconFileCode },
  { ext: ".htm", label: "HTML", Icon: IconFileCode },
  { ext: ".epub", label: "EPUB", Icon: IconBookMarked },
  { ext: ".png", label: "PNG", Icon: IconFileImage },
  { ext: ".jpg", label: "JPG", Icon: IconFileImage },
  { ext: ".jpeg", label: "JPEG", Icon: IconFileImage },
  { ext: ".webp", label: "WebP", Icon: IconFileImage },
];

const SUPPORTED_ACCEPT = SUPPORTED_FORMATS.map(f => f.ext).join(",");
const SUPPORTED_SUFFIXES = new Set(SUPPORTED_FORMATS.map(f => f.ext));

type ImportTab = "pdf" | "bibtex" | "zotero";
type ImportStatus = "queued" | "saved" | "parsing" | "indexing" | "summarizing" | "enriching" | "ready" | "needs_ocr" | "importing" | "indexed" | "failed" | "success" | "imported" | "duplicate" | "error" | "pending";

interface ImportResult {
  job_id?: string;
  filename: string;
  status: ImportStatus | string;
  stage?: string;
  progress?: number;
  paper_id?: string;
  error?: string;
  pages?: number;
  title?: string;
  suggestedTitle?: string;
  ocrPagesCount?: number;
  ocrPagesFailed?: number;
  isScanned?: boolean;
  pdfStatus?: string;
  pdfError?: string;
  editing?: boolean;
}

export const ImportPanel: React.FC<{ onImported: (paperId?: string) => void }> = ({ onImported }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ImportTab>("pdf");
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const bibtexInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const statusStreamRef = useRef<{ abort: () => void } | null>(null);

  const clearStatusPolling = useCallback(() => {
    if (statusStreamRef.current) {
      statusStreamRef.current.abort();
      statusStreamRef.current = null;
    }
  }, []);

  useEffect(() => clearStatusPolling, [clearStatusPolling]);

  const mergeJobsIntoResults = useCallback((jobs: ImportJob[]) => {
    setResults((prev) => prev.map((result) => {
      const latest = jobs.find((job) => job.id === result.job_id || (result.paper_id && job.paper_id === result.paper_id));
      if (!latest) return result;
      return {
        ...result,
        job_id: latest.id,
        paper_id: latest.paper_id || result.paper_id,
        status: latest.status,
        stage: latest.stage,
        progress: latest.progress,
        error: latest.error || result.error,
        ocrPagesCount: latest.ocr_pages_count,
        ocrPagesFailed: latest.ocr_pages_failed,
        isScanned: latest.is_scanned,
      };
    }));
  }, []);

  const startStatusPolling = useCallback((jobIds: string[]) => {
    const ids = [...new Set(jobIds.filter(Boolean))];
    if (ids.length === 0) return;

    clearStatusPolling();
    const started = performance.now();
    statusStreamRef.current = api.streamImportJobs(ids, {
      onJobs: (tracked) => {
        mergeJobsIntoResults(tracked);
      },
      onDone: (tracked) => {
        clearStatusPolling();
        const firstReady = tracked.find((job) => job.status === "ready" && job.paper_id);
        console.info(`IMPORT_FRONTEND_TIMING jobs=${tracked.length} total_ms=${(performance.now() - started).toFixed(1)}`);
        onImported(firstReady?.paper_id || tracked.find((job) => job.paper_id)?.paper_id || undefined);
      },
      onError: async () => {
        const res = await api.listImportJobs(100);
        const tracked = res.jobs.filter((job) => ids.includes(job.id));
        mergeJobsIntoResults(tracked);
        onImported(tracked.find((job) => job.paper_id)?.paper_id || undefined);
      },
    });
  }, [clearStatusPolling, mergeJobsIntoResults, onImported]);

  const retryJob = async (jobId: string) => {
    await api.retryImportJob(jobId);
    setResults((prev) => prev.map((result) => result.job_id === jobId ? { ...result, status: "queued", stage: "retry", progress: 0, error: "" } : result));
    startStatusPolling([jobId]);
  };

  const startEditing = (idx: number, currentTitle: string) => {
    setEditingIndex(idx);
    setEditValue(currentTitle);
  };

  const saveTitle = async (idx: number) => {
    const result = results[idx];
    if (!result || !result.paper_id || !editValue.trim()) return;
    const newTitle = editValue.trim();
    try {
      await api.updatePaper(result.paper_id, { title: newTitle });
      setResults((prev) => prev.map((r, i) => i === idx ? { ...r, title: newTitle, suggestedTitle: newTitle } : r));
    } catch {
      // revert silently
    }
    setEditingIndex(null);
    setEditValue("");
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTitle(idx);
    }
    if (e.key === "Escape") {
      setEditingIndex(null);
      setEditValue("");
    }
  };

  // ── PDF Import ────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const isSupported = (name: string) => {
    const ext = name.toLowerCase().split(".").pop();
    return ext ? SUPPORTED_SUFFIXES.has("." + ext) : false;
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => isSupported(f.name));
    if (files.length > 0) await importFiles(files);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => isSupported(f.name));
    if (files.length > 0) await importFiles(files);
    e.target.value = "";
  };

  const handleFolderSelect = () => {
    const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
    if (isTauri) {
      (async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const folder = await invoke<string | null>("select_folder");
          if (folder) {
            await importFolder(folder);
          }
        } catch (err) {
          console.error("Tauri native folder picker failed:", err);
        }
      })();
    } else {
      folderInputRef.current?.click();
    }
  };

  const handleFolderInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => isSupported(f.name));
    if (files.length > 0) await importFiles(files);
    e.target.value = "";
  };

  const importFiles = async (files: File[]) => {
    setImporting(true);
    setResults([]);
    const newResults: ImportResult[] = [];

    for (const file of files) {
      try {
        const res = await api.importPaper(file);
        const suggested = (res as any).suggested_title || res.title;
        newResults.push({
          job_id: res.job_id,
          filename: file.name,
          status: res.status || "indexing",
          progress: 35,
          paper_id: res.paper_id,
          pages: res.page_count,
          title: suggested,
          suggestedTitle: suggested,
          ocrPagesCount: res.ocr_pages_count,
          ocrPagesFailed: res.ocr_pages_failed,
          isScanned: res.is_scanned,
        });
      } catch (e) {
        newResults.push({
          filename: file.name,
          status: "error",
          error: e instanceof Error ? e.message : t("error.unknown"),
        });
      }
    }

    setResults(newResults);
    setImporting(false);
    const indexingIds = newResults
      .filter((r) => r.job_id && r.status !== "error")
      .map((r) => r.job_id as string);
    if (indexingIds.length > 0) startStatusPolling(indexingIds);
    else onImported();
  };

  const importFolder = async (folderPath: string) => {
    setImporting(true);
    setResults([]);
    try {
      const res = await api.importFolder(folderPath);
      const importResults = res.results as ImportResult[];
      setResults(importResults);
      const indexingIds = importResults
        .filter((r) => r.job_id && r.status !== "error" && r.status !== "failed")
        .map((r) => r.job_id as string);
      if (indexingIds.length > 0) startStatusPolling(indexingIds);
      else onImported();
    } catch (e) {
      setResults([{
        filename: folderPath,
        status: "error",
        error: e instanceof Error ? e.message : t("import.error_folder"),
      }]);
      onImported();
    } finally {
      setImporting(false);
    }
  };

  // ── BibTeX Import ────────────────────────────────────────────

  const handleBibtexSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResults([]);
    try {
      const res = await api.importBibtex(file);
      setResults(res.results.map(r => ({
        filename: r.filename,
        status: r.status === "imported" ? "success" : "error",
        paper_id: r.paper_id,
        title: r.title,
        error: r.error,
      })));
    } catch (e) {
      setResults([{
        filename: file.name,
        status: "error",
        error: e instanceof Error ? e.message : t("import.error_bibtex"),
      }]);
    } finally {
      setImporting(false);
      onImported();
    }
    e.target.value = "";
  };

  // ── Zotero CSV Import ────────────────────────────────────────
  
  const [zoteroDataDir, setZoteroDataDir] = useState("");
  const [findPdfs, setFindPdfs] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(false);

  // Load saved Zotero path + auto-detect on mount
  useEffect(() => {
    if (tab === "zotero" && !zoteroDataDir && !detecting && !detected) {
      // Step 1: Try to load saved path from settings first
      api.getSettings()
        .then((s) => {
          if ((s as any).zotero_data_dir && (s as any).zotero_data_dir.trim()) {
            setZoteroDataDir((s as any).zotero_data_dir);
            setDetected(true);
            return; // Don't auto-detect if already saved
          }
          // Step 2: No saved path, auto-detect
          setDetecting(true);
          return api.detectZoteroDataDir()
            .then((res) => {
              if (res.found && res.path) {
                setZoteroDataDir(res.path);
                // Save the detected path
                api.saveZoteroPath(res.path).catch(() => {});
              }
            });
        })
        .catch(() => { /* fail silently */ })
        .finally(() => {
          setDetecting(false);
          setDetected(true);
        });
    }
  }, [tab, zoteroDataDir, detecting, detected]);

  // Save Zotero path to settings whenever it changes (debounced via blur or manual save)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleZoteroPathChange = useCallback((newPath: string) => {
    setZoteroDataDir(newPath);
    // Debounce save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (newPath.trim()) {
        api.saveZoteroPath(newPath.trim()).catch(() => {});
      }
    }, 1500);
  }, []);

  const handleCsvSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResults([]);
    try {
      if (findPdfs && zoteroDataDir.trim()) {
        // Import with PDF finding
        const res = await api.importZoteroCsvWithPdfs(file, zoteroDataDir.trim());
        const importResults = res.results.map(r => ({
          job_id: (r as any).job_id,
          filename: r.filename,
          status: r.status === "imported" ? "success" : r.status,
          paper_id: r.paper_id,
          title: r.title,
          error: r.error,
          pages: r.page_count,
          pdfStatus: r.pdf_status,
          pdfError: r.pdf_error,
        }));
        setResults(importResults);
        const indexingIds = importResults
          .filter((r) => r.job_id && (r.pdfStatus === "indexing" || r.status === "success"))
          .map((r) => r.job_id as string);
        if (indexingIds.length > 0) startStatusPolling(indexingIds);
        else onImported();
      } else {
        // Metadata only
        const res = await api.importZoteroCsv(file);
        setResults(res.results.map(r => ({
          filename: r.filename,
          status: r.status === "imported" ? "success" : "error",
          paper_id: r.paper_id,
          title: r.title,
          error: r.error,
        })));
        onImported();
      }
    } catch (e) {
      setResults([{
        filename: file.name,
        status: "error",
        error: e instanceof Error ? e.message : t("import.error_csv"),
      }]);
      onImported();
    } finally {
      setImporting(false);
    }
    e.target.value = "";
  };

  const successCount = results.filter(r => ["success", "imported", "indexed", "ready"].includes(r.status)).length;
  const processingCount = results.filter(r => ["queued", "saved", "parsing", "importing", "indexing", "summarizing", "enriching", "pending"].includes(r.status) || r.stage === "ocr").length;
  const needsOcrCount = results.filter(r => r.status === "needs_ocr").length;
  const failedCount = results.filter(r => r.status === "failed").length;
  const duplicateCount = results.filter(r => r.status === "duplicate").length;
  const errorCount = results.filter(r => r.status === "error").length;
  const pdfIndexingCount = results.filter(r => r.pdfStatus === "indexing").length;
  const pdfNotFoundCount = results.filter(r => r.pdfStatus === "not_found").length;

  return (
    <div className="import-panel">
      {/* Tab selector */}
      <div className="import-tabs" style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--color-border, #e5e7eb)", paddingBottom: 8 }}>
        <button
          onClick={() => setTab("pdf")}
          className={`import-tab-btn ${tab === "pdf" ? "active" : ""}`}
          style={{
            flex: 1, padding: "8px 12px", border: "none", borderRadius: 6, cursor: "pointer",
            fontSize: 13, fontWeight: tab === "pdf" ? 600 : 400,
            background: tab === "pdf" ? "var(--color-primary)" : "transparent",
            color: tab === "pdf" ? "#fff" : "var(--color-text, #1a1a1a)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => { if (tab !== "pdf") { e.currentTarget.style.background = "rgba(var(--color-primary-rgb), 0.08)"; e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(var(--color-primary-rgb), 0.2)"; } }}
          onMouseLeave={(e) => { if (tab !== "pdf") { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "none"; } }}
        >
          <IconUpload size={14} /> {t("import.tab_documents")}
        </button>
        <button
          onClick={() => setTab("bibtex")}
          className={`import-tab-btn ${tab === "bibtex" ? "active" : ""}`}
          style={{
            flex: 1, padding: "8px 12px", border: "none", borderRadius: 6, cursor: "pointer",
            fontSize: 13, fontWeight: tab === "bibtex" ? 600 : 400,
            background: tab === "bibtex" ? "var(--color-primary)" : "transparent",
            color: tab === "bibtex" ? "#fff" : "var(--color-text, #1a1a1a)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => { if (tab !== "bibtex") { e.currentTarget.style.background = "rgba(var(--color-primary-rgb), 0.08)"; e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(var(--color-primary-rgb), 0.2)"; } }}
          onMouseLeave={(e) => { if (tab !== "bibtex") { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "none"; } }}
        >
          <IconBook size={14} /> {t("import.tab_bibtex")}
        </button>
        <button
          onClick={() => setTab("zotero")}
          className={`import-tab-btn ${tab === "zotero" ? "active" : ""}`}
          style={{
            flex: 1, padding: "8px 12px", border: "none", borderRadius: 6, cursor: "pointer",
            fontSize: 13, fontWeight: tab === "zotero" ? 600 : 400,
            background: tab === "zotero" ? "var(--color-primary)" : "transparent",
            color: tab === "zotero" ? "#fff" : "var(--color-text, #1a1a1a)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => { if (tab !== "zotero") { e.currentTarget.style.background = "rgba(var(--color-primary-rgb), 0.08)"; e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(var(--color-primary-rgb), 0.2)"; } }}
          onMouseLeave={(e) => { if (tab !== "zotero") { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "none"; } }}
        >
          <IconLibrary size={14} /> {t("import.tab_zotero")}
        </button>
      </div>

      {/* Tab: PDF & Documents */}
      {tab === "pdf" && (
        <div
          className={`import-dropzone ${dragOver ? "drag-over" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="import-dropzone-icon">
            <IconUpload size={32} />
          </div>
          <h3>{t("import.dropzone_title")}</h3>
          <p>{t("import.dropzone_text")}</p>
          <div className="import-formats">
            {[...new Map(SUPPORTED_FORMATS.map(f => [f.label, f])).values()].map(fmt => (
              <span key={fmt.ext} className="import-format-badge">
                <fmt.Icon size={14} /> {fmt.label}
              </span>
            ))}
          </div>
          <div className="import-actions">
            <button
              className="import-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <IconFileText size={16} style={{ marginRight: 4 }} />
              {t("import.select_file")}
            </button>
            <button
              className="import-btn import-btn-secondary"
              onClick={handleFolderSelect}
              disabled={importing}
            >
              <IconFolderOpen size={16} style={{ marginRight: 4 }} />
              {t("import.select_folder")}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_ACCEPT}
            multiple
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore - webkitdirectory is valid HTML attr
            webkitdirectory=""
            multiple
            style={{ display: "none" }}
            onChange={handleFolderInput}
          />
        </div>
      )}

      {/* Tab: BibTeX */}
      {tab === "bibtex" && (
        <div className="import-dropzone">
          <div className="import-dropzone-icon">
            <IconBook size={32} />
          </div>
          <h3>{t("import.bibtex_title")}</h3>
          <p>{t("import.bibtex_desc")}</p>
          <div className="import-actions">
            <button
              className="import-btn"
              onClick={() => bibtexInputRef.current?.click()}
              disabled={importing}
            >
              <IconFileText size={16} style={{ marginRight: 4 }} />
              {t("import.bibtex_btn")}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
            <IconWithText icon={IconInfo} size={12}>
              {t("import.bibtex_info")}
            </IconWithText>
          </p>
          <input
            ref={bibtexInputRef}
            type="file"
            accept=".bib"
            style={{ display: "none" }}
            onChange={handleBibtexSelect}
          />
        </div>
      )}

      {/* Tab: Zotero CSV */}
      {tab === "zotero" && (
        <div className="import-dropzone">
          <div className="import-dropzone-icon">
            <IconLibrary size={32} />
          </div>
          <h3>{t("import.zotero_title")}</h3>
          <p>{t("import.zotero_desc")}</p>

          {/* Zotero data directory input */}
          <div style={{ width: "100%", maxWidth: 400, margin: "0 auto 12px", textAlign: "left" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text, #1a1a1a)", display: "block", marginBottom: 4 }}>
              {t("import.zotero_dir_label")}
              {detecting && (
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 6 }}>
                  <IconSpinner size={10} style={{ verticalAlign: "middle", marginRight: 3 }} />
                  {t("import.zotero_detecting")}
                </span>
              )}
              {detected && zoteroDataDir && !detecting && (
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-success, #22c55e)", marginLeft: 6 }}>
                  {t("import.zotero_detected")}
                </span>
              )}
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={zoteroDataDir}
                onChange={(e) => handleZoteroPathChange(e.target.value)}
                placeholder={detecting ? t("import.zotero_dir_placeholder") : t("import.zotero_dir_example")}
                style={{
                  flex: 1, padding: "8px 10px", border: "1px solid var(--color-border, #d1d5db)",
                  borderRadius: 6, fontSize: 13, background: "var(--color-input, #fff)",
                  color: "var(--color-text, #1a1a1a)", outline: "none",
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    const folder = await invoke<string | null>("select_folder");
                    if (folder) handleZoteroPathChange(folder);
                  } catch {}
                }}
                style={{
                  padding: "8px 12px", border: "1px solid var(--color-border, #d1d5db)",
                  borderRadius: 6, cursor: "pointer", fontSize: 13,
                  background: "var(--color-bg, #f9fafb)", color: "var(--color-text, #1a1a1a)",
                  transition: "all 0.15s ease",
                }}
                title={t("import.zotero_dir_btn")}
              >
              <IconFolderOpen size={16} />
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
              {t("import.zotero_dir_hint")}
            </p>
          </div>

          {/* Toggle PDF finding */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
              fontSize: 13, color: "var(--color-text, #1a1a1a)",
            }}>
              <input
                type="checkbox"
                checked={findPdfs}
                onChange={(e) => setFindPdfs(e.target.checked)}
                style={{ accentColor: "var(--color-primary)" }}
              />
              {t("import.zotero_auto_find")}
            </label>
          </div>

          {/* Import button */}
          <div className="import-actions">
            <button
              className="import-btn"
              onClick={() => csvInputRef.current?.click()}
              disabled={importing}
              title={findPdfs && !zoteroDataDir.trim() ? t("import.zotero_needs_dir") : ""}
            >
              <IconFileText size={16} style={{ marginRight: 4 }} />
              {t("import.zotero_csv_btn")}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
            <IconWithText icon={IconInfo} size={12}>
              {t("import.zotero_export_guide")}
              {findPdfs && zoteroDataDir.trim() ? t("import.zotero_pdf_note") : ""}
            </IconWithText>
          </p>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleCsvSelect}
          />
        </div>
      )}

      {/* Progress */}
      {importing && (
        <div className="import-progress">
          <IconSpinner size={20} />
          <span>{t("import.uploading")}</span>
        </div>
      )}

      {results.length > 0 && !importing && processingCount > 0 && (
        <div className="import-progress">
          <IconSpinner size={20} />
          <span>
            {results.some((r) => r.stage === "ocr")
              ? t("import.ocr_processing")
              : t("import.indexing")}
          </span>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && !importing && (
        <div className="import-results">
          <div className="import-results-header">
            <span>
              {successCount > 0 && <IconCheck size={16} style={{ color: "var(--color-success)", marginRight: 4 }} />}
              {successCount} {t("import.status_success")}
              {processingCount > 0 && `, ${processingCount} ${t("import.status_processing")}`}
              {needsOcrCount > 0 && `, ${needsOcrCount} ${t("import.status_ocr")}`}
              {duplicateCount > 0 && `, ${duplicateCount} ${t("import.status_duplicate")}`}
              {failedCount > 0 && `, ${failedCount} ${t("import.status_failed")}`}
              {errorCount > 0 && `, ${errorCount} ${t("import.status_error")}`}
              {pdfIndexingCount > 0 && `, ${pdfIndexingCount} ${t("import.status_pdf")}`}
              {pdfNotFoundCount > 0 && `, ${pdfNotFoundCount} ${t("import.status_no_pdf")}`}
            </span>
          </div>
          <div className="import-results-list">
            {results.map((r, i) => {
              let iconColor: string;
              let rowClass: string;
              const isProcessing = ["queued", "saved", "parsing", "importing", "indexing", "summarizing", "enriching", "pending"].includes(r.status) || r.stage === "ocr";
              if (r.status === "error" || r.status === "failed") {
                iconColor = "var(--color-error, #ef4444)";
                rowClass = "import-error";
              } else if (r.status === "needs_ocr") {
                iconColor = "var(--color-warning, #f59e0b)";
                rowClass = "import-duplicate";
              } else if (r.status === "duplicate") {
                iconColor = "var(--color-text-muted)";
                rowClass = "import-duplicate";
              } else if (isProcessing) {
                iconColor = "var(--color-primary, #2dd4bf)";
                rowClass = "import-processing";
              } else {
                iconColor = "var(--color-success, #22c55e)";
                rowClass = "import-success";
              }
              // Zotero PDF status indicators
              const pdfStatus = r.pdfStatus;
              const pdfError = r.pdfError;
              return (
                <div key={i} className={`import-result-item ${rowClass}`}>
                  <span className="import-result-icon">
                    {r.status === "error" || r.status === "failed" ? (
                      <IconError size={16} style={{ color: iconColor }} />
                    ) : r.status === "needs_ocr" ? (
                      <IconWarning size={16} style={{ color: iconColor }} />
                    ) : r.status === "duplicate" ? (
                      <IconCircle size={16} style={{ color: iconColor }} />
                    ) : isProcessing ? (
                      <IconSpinner size={16} style={{ color: iconColor }} />
                    ) : (
                      <IconCheck size={16} style={{ color: iconColor }} />
                    )}
                  </span>
                  {editingIndex === i ? (
                    <input
                      className="import-result-name-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => saveTitle(i)}
                      onKeyDown={(e) => handleTitleKeyDown(e, i)}
                      autoFocus
                      style={{
                        flex: 1, minWidth: 0, padding: "2px 6px", borderRadius: 4,
                        border: "1px solid var(--color-primary)",
                        background: "var(--color-bg, #f9fafb)",
                        color: "var(--color-text, #1a1a1a)", fontSize: 13, outline: "none",
                      }}
                    />
                  ) : (
                    <span
                      className="import-result-name"
                      style={{ cursor: r.paper_id ? "pointer" : "default" }}
                      onClick={() => r.paper_id && startEditing(i, r.title || r.filename)}
                      title={r.paper_id ? t("import.click_rename") : ""}
                    >
                      {r.title || r.filename}
                      {r.paper_id && (
                        <IconEdit size={11} style={{ marginLeft: 6, opacity: 0.4 }} />
                      )}
                    </span>
                  )}
                  {r.pages && <span className="import-result-pages">{r.pages} {t("import.page")}</span>}
                  {isProcessing && <span className="import-result-pages">{r.stage || r.status} {typeof r.progress === "number" ? `${r.progress}%` : ""}</span>}
                  {["indexed", "ready"].includes(r.status) && <span className="import-result-pages">{t("import.ready_status")}</span>}
                  {r.status === "needs_ocr" && <span className="import-result-pages" style={{ color: "var(--color-warning, #f59e0b)" }}>{t("import.status_ocr")}</span>}
                  {r.status === "duplicate" && <span className="import-result-pages" style={{ color: "var(--color-text-muted)" }}>{t("import.status_duplicate")}</span>}
                  {r.isScanned && (
                    <span style={{
                      fontSize: 11, marginLeft: 6, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(245, 158, 11, 0.1)", color: "var(--color-warning, #f59e0b)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {t("import.ocr_status", { n: r.ocrPagesCount || 0, m: r.ocrPagesFailed || "" })}
                    </span>
                  )}
                  {r.error && <span className="import-result-error">{r.error}</span>}
                  {r.job_id && ["failed", "needs_ocr"].includes(r.status) && (
                    <button
                      type="button"
                      className="import-retry-btn"
                      onClick={() => retryJob(r.job_id as string)}
                    >
                      {t("import.retry")}
                    </button>
                  )}
                  {/* PDF status badge */}
                  {pdfStatus === "indexing" && (
                    <span style={{
                      fontSize: 11, marginLeft: 6, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(45, 212, 191, 0.1)", color: "var(--color-primary, #2dd4bf)",
                      display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      <IconSpinner size={10} /> PDF
                    </span>
                  )}
                  {pdfStatus === "not_found" && (
                    <span style={{
                      fontSize: 11, marginLeft: 6, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(234, 179, 8, 0.1)", color: "#a16207",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }} title={pdfError || t("import.pdf_not_found_title")}>
                      <IconWithText icon={IconFileText} size={10}>{t("import.pdf_not_found_badge")}</IconWithText>
                    </span>
                  )}
                  {pdfStatus === "warning" && (
                    <span style={{
                      fontSize: 11, marginLeft: 6, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(249, 115, 22, 0.1)", color: "#c2410c",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }} title={pdfError || t("import.pdf_scanned_title")}>
                      <IconWithText icon={IconScanSearch} size={10}>{t("import.pdf_scanned_badge")}</IconWithText>
                    </span>
                  )}
                  {pdfStatus === "error" && (
                    <span style={{
                      fontSize: 11, marginLeft: 6, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(239, 68, 68, 0.1)", color: "var(--color-error, #ef4444)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }} title={pdfError || t("import.pdf_error_title")}>
                      <IconWithText icon={IconError} size={10}>{t("import.pdf_error_badge")}</IconWithText>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
