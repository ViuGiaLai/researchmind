import React, { useState, useRef, useCallback } from "react";
import { api } from "../../lib/api";
import {
  IconFileText,
  IconSpinner,
  IconCheck,
  IconError,
  IconFolderOpen,
  IconUpload,
} from "../Icons";

interface ImportResult {
  filename: string;
  status: string;
  paper_id?: string;
  error?: string;
  pages?: number;
}

export const ImportPanel: React.FC<{ onImported: () => void }> = ({ onImported }) => {
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (files.length > 0) await importFiles(files);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (files.length > 0) await importFiles(files);
    e.target.value = "";
  };

  const handleFolderSelect = async () => {
    // Try Tauri custom folder picker first, fallback to HTML input
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const folder = await invoke<string | null>("select_folder");
      if (folder) {
        await importFolder(folder);
      }
    } catch {
      // Fallback to HTML input with webkitdirectory
      folderInputRef.current?.click();
    }
  };

  const handleFolderInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith(".pdf"));
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
        newResults.push({
          filename: file.name,
          status: "importing",
          paper_id: res.paper_id,
          pages: res.page_count,
        });
      } catch (e) {
        newResults.push({
          filename: file.name,
          status: "error",
          error: e instanceof Error ? e.message : "Lỗi không xác định",
        });
      }
    }

    setResults(newResults);
    setImporting(false);
    onImported();
  };

  const importFolder = async (folderPath: string) => {
    setImporting(true);
    setResults([]);
    try {
      const res = await api.importFolder(folderPath);
      setResults(res.results as ImportResult[]);
    } catch (e) {
      setResults([{
        filename: folderPath,
        status: "error",
        error: e instanceof Error ? e.message : "Không thể import folder",
      }]);
    } finally {
      setImporting(false);
      onImported();
    }
  };

  const successCount = results.filter(r => r.status !== "error").length;
  const errorCount = results.filter(r => r.status === "error").length;

  return (
    <div className="import-panel">
      {/* Drop zone */}
      <div
        className={`import-dropzone ${dragOver ? "drag-over" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="import-dropzone-icon">
          <IconUpload size={32} />
        </div>
        <h3>Import PDF</h3>
        <p>Kéo thả file PDF vào đây, hoặc</p>
        <div className="import-actions">
          <button
            className="import-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <IconFileText size={16} style={{ marginRight: 4 }} />
            Chọn file
          </button>
          <button
            className="import-btn import-btn-secondary"
            onClick={handleFolderSelect}
            disabled={importing}
          >
            <IconFolderOpen size={16} style={{ marginRight: 4 }} />
            Chọn thư mục
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
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

      {/* Progress */}
      {importing && (
        <div className="import-progress">
          <IconSpinner size={20} />
          <span>Đang import và index PDF...</span>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && !importing && (
        <div className="import-results">
          <div className="import-results-header">
            <span>
              {successCount > 0 && <IconCheck size={16} style={{ color: "var(--color-success)", marginRight: 4 }} />}
              {successCount} thành công
              {errorCount > 0 && `, ${errorCount} lỗi`}
            </span>
          </div>
          <div className="import-results-list">
            {results.map((r, i) => (
              <div key={i} className={`import-result-item ${r.status === "error" ? "import-error" : "import-success"}`}>
                <span className="import-result-icon">
                  {r.status === "error" ? (
                    <IconError size={16} style={{ color: "var(--color-error, #ef4444)" }} />
                  ) : (
                    <IconCheck size={16} style={{ color: "var(--color-success, #22c55e)" }} />
                  )}
                </span>
                <span className="import-result-name">{r.filename}</span>
                {r.pages && <span className="import-result-pages">{r.pages} trang</span>}
                {r.error && <span className="import-result-error">{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
