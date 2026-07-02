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
    if (importing.has(paper.doi || paper.title)) return;
    setImporting(prev => new Set(prev).add(paper.doi || paper.title));
    try {
      await api.importPaperByMetadata({
        doi: paper.doi || undefined,
        title: paper.title,
        authors: paper.authors,
        year: paper.year || undefined,
        journal: paper.journal,
        abstract: paper.abstract,
      });
      toast.addToast("success", `Đã thêm "${paper.title.slice(0, 50)}..." vào thư viện`);
    } catch {
      toast.addToast("error", `Không thể thêm "${paper.title.slice(0, 40)}..."`);
    } finally {
      setImporting(prev => {
        const next = new Set(prev);
        next.delete(paper.doi || paper.title);
        return next;
      });
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "20px", overflow: "hidden" }}>
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <IconSparkle size={22} className="icon-gradient" />
          Khám phá học thuật
        </h2>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--color-text-muted, #94a3b8)" }}>
          Tìm kiếm bài báo từ OpenAlex và Semantic Scholar
        </p>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="Nhập research question, ví dụ: 'machine learning for drug discovery'..."
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "6px",
            border: "1px solid var(--color-border, #282828)",
            background: "var(--color-surface, #141414)",
            color: "var(--color-text, #e4e4e7)",
            fontSize: "0.85rem",
            outline: "none",
          }}
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          style={{
            padding: "10px 20px",
            borderRadius: "6px",
            border: "none",
            background: searching ? "var(--color-border, #333)" : "var(--color-primary, #6366f1)",
            color: "#fff",
            fontWeight: 600,
            cursor: searching || !query.trim() ? "not-allowed" : "pointer",
            fontSize: "0.85rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            opacity: !query.trim() ? 0.5 : 1,
          }}
        >
          {searching ? <IconSpinner size={14} /> : <IconSearch size={14} />}
          {searching ? "Đang tìm..." : "Tìm kiếm"}
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {searching && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: "12px", color: "var(--color-text-muted, #94a3b8)" }}>
            <IconSpinner size={20} />
            <span>Đang tìm kiếm trên OpenAlex và Semantic Scholar...</span>
          </div>
        )}

        {!searching && searched && results.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-muted, #94a3b8)", fontSize: "0.9rem" }}>
            Không tìm thấy kết quả. Thử từ khoá khác.
          </div>
        )}

        {!searching && results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", marginBottom: "4px" }}>
              {results.length} kết quả
            </div>
            {results.map((paper, i) => {
              const isImporting = importing.has(paper.doi || paper.title);
              return (
                <div
                  key={`${paper.doi || paper.title}-${i}`}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border, #282828)",
                    background: "var(--color-surface, #141414)",
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--color-text, #e4e4e7)", marginBottom: "4px" }}>
                      {paper.title}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", marginBottom: "4px" }}>
                      {paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}
                      {paper.year && <span> &middot; {paper.year}</span>}
                    </div>
                    <div style={{ display: "flex", gap: "12px", fontSize: "0.75rem", color: "var(--color-text-muted, #94a3b8)", marginBottom: "4px" }}>
                      <span>{paper.citation_count} trích dẫn</span>
                      {paper.journal && <span>{paper.journal}</span>}
                      <span style={{ opacity: 0.6 }}>{paper.source === "openalex" ? "OpenAlex" : "Semantic Scholar"}</span>
                    </div>
                    {paper.abstract && (
                      <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {paper.abstract}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleImport(paper)}
                    disabled={isImporting}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-border, #333)",
                      background: isImporting ? "rgba(16, 185, 129, 0.1)" : "transparent",
                      color: isImporting ? "#10b981" : "var(--color-text-muted, #94a3b8)",
                      cursor: isImporting ? "default" : "pointer",
                      fontSize: "0.78rem",
                      fontWeight: 500,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      transition: "all 0.15s",
                    }}
                  >
                    {isImporting ? <IconCheck size={12} /> : <IconDownload size={12} />}
                    {isImporting ? "Đã thêm" : "Thêm vào thư viện"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!searching && !searched && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "var(--color-text-muted, #555)" }}>
            <IconBrain size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
            <p style={{ fontSize: "0.9rem", textAlign: "center", maxWidth: "400px" }}>
              Nhập research question để khám phá bài báo từ các cơ sở dữ liệu học thuật.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
