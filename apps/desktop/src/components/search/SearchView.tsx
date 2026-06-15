import React, { useState } from "react";
import { api, SearchResult } from "../../lib/api";
import {
  IconSearch,
  IconBrain,
  IconFileText,
  IconSpinner,
  IconChat,
  IconBulb,
} from "../Icons";

export const SearchView: React.FC<{ onStartChat: (paperIds: string[]) => void }> = ({ onStartChat }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await api.search(q, undefined, 10);
      setResults(res.results);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const chatWithResults = () => {
    const paperIds = [...new Set(results.map((r) => r.paper_id))];
    if (paperIds.length > 0) onStartChat(paperIds);
  };

  return (
    <div className="search-view">
      <div className="search-hero">
        <h2 className="search-hero-title">
          <IconBrain size={28} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 8 }} />
          ResearchMind VN
        </h2>
        <p className="search-hero-desc">
          Tìm kiếm ngữ nghĩa trong toàn bộ thư viện PDF của bạn
        </p>
      </div>

      <div className="search-bar-container">
        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder='Ví dụ: "phương pháp đánh giá độ trễ mạng 5G"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="search-btn" onClick={handleSearch} disabled={searching}>
            {searching ? <IconSpinner size={24} /> : <IconSearch size={24} />}
          </button>
        </div>
      </div>

      <div className="search-results">
        {searching && (
          <div className="search-loading">
            <IconSpinner size={24} />
            <span>Đang tìm kiếm...</span>
          </div>
        )}

        {!searching && searched && results.length === 0 && (
          <div className="search-empty">
            <IconBrain size={48} className="icon-gradient" />
            <h3>Không tìm thấy kết quả</h3>
            <p>Thử với từ khóa khác hoặc import thêm PDF.</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="search-results-header">
              <span className="search-results-count">
                🎯 {results.length} kết quả
              </span>
              <button className="search-chat-btn" onClick={chatWithResults}>
                <IconChat size={16} style={{ marginRight: 4 }} />
                Chat với kết quả này
              </button>
            </div>

            <div className="search-results-list">
              {results.map((r, i) => (
                <div key={r.chunk_id} className="search-result-card">
                  <div className="search-result-num">{i + 1}</div>
                  <div className="search-result-content">
                    <div className="search-result-header">
                      <span className="search-result-title">
                        <IconFileText size={16} style={{ marginRight: 4 }} />
                        {r.paper_title}
                      </span>
                      <span className="search-result-score">
                        ⭐ {(r.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    {r.page_number && (
                      <span className="search-result-page">Trang {r.page_number}</span>
                    )}
                    <p className="search-result-text">{r.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!searched && (
          <div className="search-suggestions">
            <IconBulb size={20} className="icon-gradient" />
            <span>Gợi ý: "phương pháp đánh giá độ trễ", "5G network slicing", "deep learning trong xử lý ảnh"</span>
          </div>
        )}
      </div>
    </div>
  );
};
