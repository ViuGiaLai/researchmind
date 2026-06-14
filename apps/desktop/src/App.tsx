import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFolders } from "./hooks/useFolders";
import { useScan } from "./hooks/useScan";
import { useChat } from "./hooks/useChat";
import { useSearchFilters } from "./hooks/useSearchFilters";
import { useOllamaConfig } from "./hooks/useOllamaConfig";
import { SearchFilters } from "./components/search/SearchFilters";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import {
  IconBrain,
  IconSearch,
  IconMenu,
  IconClose,
  IconChart,
  IconChat,
  IconSettings,
  IconFolder,
  IconFileText,
  IconLock,
  IconFolderOpen,
  IconCalendar,
  getFileIcon,
} from "./components/Icons";
import { FolderPicker } from "./components/folder/FolderPicker";
import { FolderList } from "./components/folder/FolderList";
import { ScanButton } from "./components/scan/ScanButton";
import { ScanProgress } from "./components/scan/ScanProgress";
import { ChatPanel } from "./components/chat/ChatPanel";
import TimelineView from "./components/timeline/TimelineView";

// Types for search results
interface SearchResult {
  file_id: string;
  filename: string;
  path: string;
  extension: string;
  snippet: string;
  score: number;
  size: number;
  modified_at: string | null;
}

interface IndexStats {
  total_files: number;
  total_size: number;
  indexed_files: number;
  file_types: { extension: string; count: number; total_size: number }[];
  folders: string[];
}

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedView, setSelectedView] = useState("search");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    folders,
    isLoading: foldersLoading,
    isAdding: foldersAdding,
    addFolder,
    removeFolder,
  } = useFolders();

  const {
    progress: scanProgress,
    status: scanStatus,
    startScan,
    stopScan,
  } = useScan();

  const {
    messages: chatMessages,
    isLoading: chatLoading,
    sendMessage,
    clearMessages,
    retryLastMessage,
  } = useChat();

  const {
    filters,
    isOpen: filtersOpen,
    hasActiveFilters,
    toggleExtension,
    setDatePreset,
    setCustomDate,
    setFolder,
    resetFilters,
    toggleOpen: toggleFilters,
    toApiFilters,
  } = useSearchFilters();

  const {
    config: ollamaConfig,
    health: ollamaHealth,
    healthLabel: ollamaHealthLabel,
    saving: ollamaSaving,
    loadConfig: loadOllamaConfig,
    checkHealth: checkOllamaHealth,
    saveConfig: saveOllamaConfig,
  } = useOllamaConfig();

  // Refresh stats when scan completes
  useEffect(() => {
    if (scanStatus === "completed" || scanStatus === "stopped") {
      loadStats();
    }
  }, [scanStatus]);

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const result = await invoke<IndexStats>("get_stats");
      setStats(result);
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  };

  const handleSearch = async () => {
    const searchText = query.trim();
    if (!searchText) return;
    setIsSearching(true);

    try {
      const apiFilters = toApiFilters();
      const searchResults = await invoke<SearchResult[]>("search", {
        query: {
          text: searchText,
          limit: 20,
          offset: 0,
          filters: hasActiveFilters ? apiFilters : null,
        },
      });
      setResults(searchResults);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const FileIconComponent: React.FC<{ ext: string; size?: number }> = ({ ext, size = 20 }) => {
    const Icon = getFileIcon(ext);
    return <Icon size={size} />;
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <button
            className="nav-btn sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Mở thư mục"
          >
            {sidebarOpen ? <IconClose size={18} /> : <IconMenu size={18} />}
          </button>
          <h1 className="logo">
            <IconBrain size={24} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
            MemoryOS
          </h1>
        </div>
        <div className="header-right">
          <button
            className={`nav-btn ${selectedView === "search" ? "active" : ""}`}
            onClick={() => setSelectedView("search")}
          >
            <IconSearch size={16} style={{ marginRight: 4 }} /> Tìm kiếm
          </button>
          <button
            className={`nav-btn ${selectedView === "stats" ? "active" : ""}`}
            onClick={() => {
              setSelectedView("stats");
              loadStats();
            }}
          >
            <IconChart size={16} style={{ marginRight: 4 }} /> Thống kê
          </button>
          <button
            className={`nav-btn ${selectedView === "timeline" ? "active" : ""}`}
            onClick={() => setSelectedView("timeline")}
          >
            <IconCalendar size={16} style={{ marginRight: 4 }} /> Timeline
          </button>
          <button
            className={`nav-btn ${selectedView === "chat" ? "active" : ""}`}
            onClick={() => setSelectedView("chat")}
          >
            <IconChat size={16} style={{ marginRight: 4 }} /> Chat AI
          </button>
          <button
            className={`nav-btn ${selectedView === "settings" ? "active" : ""}`}
            onClick={() => setSelectedView("settings")}
          >
            <IconSettings size={16} />
          </button>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
          <div className="sidebar-section">
            <h3 className="sidebar-title"><IconFolderOpen size={14} style={{ marginRight: 4 }} /> Thư mục</h3>
            <FolderPicker onAddFolder={addFolder} isAdding={foldersAdding} />
          </div>
          <div className="sidebar-section sidebar-scan">
            <h3 className="sidebar-title"><IconSearch size={14} style={{ marginRight: 4 }} /> Quét & Index</h3>
            <ScanButton
              status={scanStatus}
              folderCount={folders.length}
              onStart={startScan}
              onStop={stopScan}
            />
            <ScanProgress progress={scanProgress} status={scanStatus} />
          </div>
          <div className="sidebar-section sidebar-folders">
            <FolderList
              folders={folders}
              onRemoveFolder={removeFolder}
              isLoading={foldersLoading}
            />
          </div>
          {stats && (
            <div className="sidebar-section sidebar-stats-preview">
              <h3 className="sidebar-title">📊 Tổng quan</h3>
              <div className="sidebar-stat-row">
                <span><IconFileText size={14} style={{ marginRight: 4 }} /> File</span>
                <span className="sidebar-stat-value">{stats.total_files}</span>
              </div>
              <div className="sidebar-stat-row">
                <span><IconChart size={14} style={{ marginRight: 4 }} /> Dung lượng</span>
                <span className="sidebar-stat-value">
                  {formatSize(stats.total_size)}
                </span>
              </div>
              <div className="sidebar-stat-row">
                <span><IconFolder size={14} style={{ marginRight: 4 }} /> Thư mục</span>
                <span className="sidebar-stat-value">
                  {stats.folders.length}
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="main">
          {selectedView === "search" && (
            <>
              <div className="search-section">
                <div className="search-bar">
                  <input
                    type="text"
                    className="search-input"
                    placeholder='🔎 "Tìm file PDF về Docker tháng trước"...'
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button className="search-btn" onClick={() => handleSearch()}>
                    {isSearching ? "⏳" : "🔍"}
                  </button>
                </div>

                <SearchFilters
                  filters={filters}
                  isOpen={filtersOpen}
                  hasActiveFilters={hasActiveFilters}
                  folders={folders}
                  onToggleExtension={toggleExtension}
                  onSetDatePreset={setDatePreset}
                  onSetCustomDate={setCustomDate}
                  onSetFolder={setFolder}
                  onReset={resetFilters}
                  onToggleOpen={toggleFilters}
                />
              </div>

              <div className="results-section">
                {results.length > 0 && (
                  <p className="results-count">
                    🎯 {results.length} kết quả
                  </p>
                )}

                {results.length > 0 && !isSearching && (
                  <div className="results-list">
                    {results.map((result) => (
                      <div key={result.file_id} className="result-card">
                        <div className="result-icon">
                          <FileIconComponent ext={result.extension} size={24} />
                        </div>
                        <div className="result-content">
                          <div className="result-header">
                            <span className="result-filename">
                              {result.filename}
                            </span>
                            <span className="result-score">
                              ⭐ {Math.round(result.score * 100)}%
                            </span>
                          </div>
                          <div className="result-meta">
                            <span>📁 {result.path}</span>
                            {result.modified_at && (
                              <span>📅 {result.modified_at}</span>
                            )}
                            <span>📐 {formatSize(result.size)}</span>
                          </div>
                          <div
                            className="result-snippet"
                            dangerouslySetInnerHTML={{
                              __html: result.snippet,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {results.length === 0 && query && !isSearching && (
                  <div className="empty-state">
                    <p>Không tìm thấy kết quả phù hợp.</p>
                    <p className="hint">
                      Gợi ý: "Tìm PDF về Docker", "CV mới sửa", "Hợp đồng ABC"
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {selectedView === "chat" && (
            <ChatPanel
              messages={chatMessages}
              isLoading={chatLoading}
              onSend={sendMessage}
              onClear={clearMessages}
              onRetry={retryLastMessage}
            />
          )}

          {selectedView === "timeline" && (
            <TimelineView />
          )}

          {selectedView === "settings" && (
            <SettingsPanel
              config={ollamaConfig}
              health={ollamaHealth}
              healthLabel={ollamaHealthLabel}
              saving={ollamaSaving}
              onCheckHealth={checkOllamaHealth}
              onSave={saveOllamaConfig}
              onLoad={loadOllamaConfig}
            />
          )}

          {selectedView === "stats" && (
            <div className="stats-section">
              <h2>📊 Thống kê</h2>
              {stats ? (
                <>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{stats.total_files}</div>
                      <div className="stat-label">Tổng file</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">
                        {formatSize(stats.total_size)}
                      </div>
                      <div className="stat-label">Tổng dung lượng</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{stats.folders.length}</div>
                      <div className="stat-label">Thư mục đã chọn</div>
                    </div>
                  </div>
                  {stats.file_types.length > 0 && (
                    <div className="file-types-section">
                      <h3>Loại file</h3>
                      <div className="file-types-list">
                        {stats.file_types.map((ft) => (
                          <div key={ft.extension} className="file-type-item">
                            <span className="file-type-icon">
                              <FileIconComponent ext={ft.extension} size={18} />
                            </span>
                            <span className="file-type-ext">
                              .{ft.extension}
                            </span>
                            <span className="file-type-count">
                              {ft.count} file
                            </span>
                            <span className="file-type-size">
                              {formatSize(ft.total_size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <p>Chưa có dữ liệu. Hãy chọn thư mục và bắt đầu index.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <footer className="footer">
        <div className="footer-left">
          <span><IconLock size={12} style={{ marginRight: 4 }} /> 0 file được upload lên Internet</span>
          <span className="footer-separator">·</span>
          <span>📁 {folders.length} thư mục</span>
        </div>
        <div className="footer-right">
          <span>🧠 MemoryOS v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
