import React, { useState } from "react";

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

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const searchResults = await invoke<SearchResult[]>("search", {
        query: { text: query, limit: 20, offset: 0, filters: null },
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

  const getFileIcon = (ext: string): string => {
    const icons: Record<string, string> = {
      pdf: "📄",
      docx: "📝",
      txt: "📃",
      md: "📑",
      jpg: "🖼️",
      png: "🖼️",
    };
    return icons[ext] || "📁";
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">🧠 MemoryOS</h1>
        </div>
        <div className="header-right">
          <button
            className={`nav-btn ${selectedView === "search" ? "active" : ""}`}
            onClick={() => setSelectedView("search")}
          >
            🔍 Tìm kiếm
          </button>
          <button
            className={`nav-btn ${selectedView === "stats" ? "active" : ""}`}
            onClick={() => setSelectedView("stats")}
          >
            📊 Thống kê
          </button>
          <button className="nav-btn">⚙️</button>
        </div>
      </header>

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
                <button className="search-btn" onClick={handleSearch}>
                  {isSearching ? "⏳" : "🔍"}
                </button>
              </div>
            </div>

            <div className="results-section">
              {results.length > 0 && (
                <p className="results-count">
                  🎯 {results.length} kết quả
                </p>
              )}

              {results.map((result) => (
                <div key={result.file_id} className="result-card">
                  <div className="result-icon">
                    {getFileIcon(result.extension)}
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
                      dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                  </div>
                </div>
              ))}

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

        {selectedView === "stats" && (
          <div className="stats-section">
            <h2>📊 Thống kê</h2>
            {stats ? (
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
                  <div className="stat-label">Thư mục</div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>Chưa có dữ liệu. Hãy chọn thư mục và bắt đầu index.</p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-left">
          <span>
            🔒 0 file được upload lên Internet
          </span>
        </div>
        <div className="footer-right">
          <span>🧠 MemoryOS v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
