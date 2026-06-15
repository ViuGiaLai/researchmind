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

const SUGGESTED_QUERIES = [
  { icon: "🧠", text: "Tổng hợp các ý tưởng chính trong thư viện" },
  { icon: "📊", text: "So sánh phương pháp giữa các paper" },
  { icon: "🔍", text: "Paper nào nói về transformer" },
  { icon: "💡", text: "Xu hướng nghiên cứu gần đây" },
  { icon: "📝", text: "Tóm tắt đóng góp chính của các paper" },
  { icon: "⚖️", text: "Điểm mạnh và yếu điểm của các phương pháp" },
];

export const SearchView: React.FC<{ onStartChat: (paperIds: string[]) => void }> = ({ onStartChat }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await api.search(searchQuery, undefined, 10);
      setResults(res.results);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setSearching(false);
    }
  };

  const handleSuggestionClick = (text: string) => {
    setQuery(text);
    performSearch(text);
  };

  const handleSearch = () => performSearch(query);

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
          <div className="search-suggestions-container">
            <div className="search-suggestions-header">
              <IconBulb size={18} className="icon-gradient" />
              <span>Gợi ý cho bạn</span>
            </div>
            <div className="search-suggestions-grid">
              {SUGGESTED_QUERIES.map((s, i) => (
                <button
                  key={i}
                  className="search-suggestion-card"
                  onClick={() => handleSuggestionClick(s.text)}
                >
                  <span className="search-suggestion-icon">{s.icon}</span>
                  <span className="search-suggestion-text">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
