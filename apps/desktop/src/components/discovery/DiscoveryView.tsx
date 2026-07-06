import React, { useState } from "react";
import { api, DiscoveredPaper } from "../../lib/api";
import { useToast } from "../shared/Toast";
import { IconSearch, IconSpinner, IconDownload, IconCheck, IconSparkle, IconBrain } from "../Icons";

export const DiscoveryView: React.FC = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoveredPaper[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Set<string>>(new Set());
  const toast = useToast();

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await api.discoverPapers(q, 20);
      setResults(res.results);
    } catch {
      toast.addToast("error", "Không thể tìm kiếm. Vui lòng thử lại.");
    } finally {
      setSearching(false);
    }
  };

  const handleImport = async (paper: DiscoveredPaper) => {
    const key = paper.doi || paper.title;
    if (importing.has(key) || imported.has(key)) return;
    setImporting((prev) => new Set(prev).add(key));
    try {
      await api.importPaperByMetadata({
        doi: paper.doi || undefined,
        title: paper.title,
        authors: paper.authors,
        year: paper.year || undefined,
        journal: paper.journal,
        abstract: paper.abstract,
      });
      setImported((prev) => new Set(prev).add(key));
      toast.addToast("success", `Đã thêm "${paper.title.slice(0, 50)}..." vào thư viện`);
    } catch {
      toast.addToast("error", `Không thể thêm "${paper.title.slice(0, 40)}..."`);
    } finally {
      setImporting((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div className="discovery-view">
      <div className="discovery-header">
        <h2>
          <IconSparkle size={22} className="icon-gradient" />
          Khám phá học thuật
        </h2>
        <p>Tìm kiếm bài báo từ OpenAlex và Semantic Scholar</p>
      </div>

      <div className="discovery-search-row">
        <input
          type="text"
          className="discovery-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="Nhập research question, ví dụ: 'machine learning for drug discovery'..."
        />
        <button
          type="button"
          className="discovery-search-btn"
          onClick={handleSearch}
          disabled={searching || !query.trim()}
        >
          {searching ? <IconSpinner size={14} /> : <IconSearch size={14} />}
          {searching ? "Đang tìm..." : "Tìm kiếm"}
        </button>
      </div>

      <div className="discovery-results">
        {searching && (
          <div className="discovery-loading">
            <IconSpinner size={20} />
            <span>Đang tìm kiếm trên OpenAlex và Semantic Scholar...</span>
          </div>
        )}

        {!searching && searched && results.length === 0 && (
          <div className="discovery-empty">Không tìm thấy kết quả. Thử từ khoá khác.</div>
        )}

        {!searching && results.length > 0 && (
          <>
            <div className="discovery-result-meta">{results.length} kết quả</div>
            {results.map((paper, i) => {
              const key = paper.doi || paper.title;
              const isImporting = importing.has(key);
              const isImported = imported.has(key);
              return (
                <div key={`${key}-${i}`} className="discovery-result-card">
                  <div className="discovery-result-title">{paper.title}</div>
                  <div className="discovery-result-meta">
                    {paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}
                    {paper.year && <span> · {paper.year}</span>}
                    {" · "}{paper.citation_count} trích dẫn
                    {paper.journal && <span> · {paper.journal}</span>}
                    {" · "}{paper.source === "openalex" ? "OpenAlex" : "Semantic Scholar"}
                  </div>
                  {paper.abstract && (
                    <div className="discovery-result-abstract">{paper.abstract}</div>
                  )}
                  <button
                    type="button"
                    className={`discovery-import-btn${isImported ? " imported" : ""}`}
                    onClick={() => handleImport(paper)}
                    disabled={isImporting || isImported}
                  >
                    {isImported || isImporting ? <IconCheck size={12} /> : <IconDownload size={12} />}
                    {isImported ? "Đã thêm" : isImporting ? "Đang thêm..." : "Thêm vào thư viện"}
                  </button>
                </div>
              );
            })}
          </>
        )}

        {!searching && !searched && (
          <div className="discovery-empty" style={{ flexDirection: "column" }}>
            <IconBrain size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <p style={{ textAlign: "center", maxWidth: 400 }}>
              Nhập research question để khám phá bài báo từ các cơ sở dữ liệu học thuật.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
