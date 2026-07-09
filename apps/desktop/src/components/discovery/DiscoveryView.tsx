import React, { useState } from "react";
import { api, DiscoveredPaper } from "../../lib/api";
import { useToast } from "../shared/Toast";
import { IconSearch, IconSpinner, IconDownload, IconCheck, IconSparkle, IconBrain, IconEye, IconLink, IconInfo, IconBookOpen } from "../Icons";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

export const DiscoveryView: React.FC = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoveredPaper[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [translating, setTranslating] = useState(false);
  const [translateMode, setTranslateMode] = useState<"original" | "vi">("original");
  const [translations, setTranslations] = useState<Map<string, { title_vi: string; abstract_vi: string }>>(new Map());
  const [detailPaper, setDetailPaper] = useState<DiscoveredPaper | null>(null);
  const toast = useToast();

  const getSourceUrl = (paper: DiscoveredPaper) => {
    if (paper.source === "openalex" && paper.openalex_id) {
      return paper.openalex_id;
    }
    if (paper.source === "semantic_scholar" && paper.s2_paper_id) {
      return `https://www.semanticscholar.org/paper/${paper.s2_paper_id}`;
    }
    if (paper.doi) return `https://doi.org/${paper.doi}`;
    return "";
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(true);
    setTranslateMode("original");
    setTranslations(new Map());
    try {
      const res = await api.discoverPapers(q, 20);
      setResults(res.results);
    } catch {
      toast.addToast("error", "Không thể tìm kiếm. Vui lòng thử lại.");
    } finally {
      setSearching(false);
    }
  };

  const handleTranslateAll = async () => {
    if (translating) return;
    if (translations.size > 0) {
      setTranslateMode(translateMode === "original" ? "vi" : "original");
      return;
    }
    setTranslating(true);
    try {
      const papers = results.map((r) => ({ title: r.title, abstract: r.abstract }));
      const res = await api.translatePapers(papers);
      const map = new Map<string, { title_vi: string; abstract_vi: string }>();
      results.forEach((r, i) => {
        const t = res.translations[i];
        if (t) map.set(r.doi || r.title, t);
      });
      setTranslations(map);
      setTranslateMode("vi");
      toast.addToast("success", `Đã dịch ${res.translations.length} bài báo`);
    } catch {
      toast.addToast("error", "Không thể dịch. Vui lòng kiểm tra API key Gemini trong .env");
    } finally {
      setTranslating(false);
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
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("File not found") || msg.includes("file not found") || msg.includes("not found on disk")) {
        toast.addToast("error", `Không tìm thấy file PDF cho bài báo này trên hệ thống.`);
      } else {
        toast.addToast("error", `Không thể thêm "${paper.title.slice(0, 40)}..."`);
      }
    } finally {
      setImporting((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleOpenPdf = async (paper: DiscoveredPaper) => {
    const url = paper.pdf_url || getSourceUrl(paper);
    if (!url) return;
    try {
      await shellOpen(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
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
        {searched && results.length > 0 && (
          <button
            type="button"
            className="discovery-translate-btn"
            onClick={handleTranslateAll}
            disabled={translating}
            title={translateMode === "vi" ? "Hiển thị bản gốc" : "Dịch tất cả sang tiếng Việt"}
          >
            {translating ? <IconSpinner size={14} /> : <span>{translateMode === "vi" ? "EN" : "VI"}</span>}
          </button>
        )}
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
              const t = translations.get(key);
              const showVi = translateMode === "vi" && t;
              return (
                <div key={`${key}-${i}`} className="discovery-result-card">
                  <div className="discovery-result-title">
                    {showVi ? t!.title_vi : paper.title}
                  </div>
                  <div className="discovery-result-meta">
                    {paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}
                    {paper.year && <span> · {paper.year}</span>}
                    {" · "}{paper.citation_count} trích dẫn
                    {paper.journal && <span> · {paper.journal}</span>}
                  </div>
                  {(showVi ? t!.abstract_vi : paper.abstract) && (
                    <div className="discovery-result-abstract">
                      {showVi ? t!.abstract_vi : paper.abstract}
                    </div>
                  )}
                  <div className="discovery-result-footer">
                    <span className={`discovery-source-badge source-${paper.source}`}>
                      {paper.source === "openalex" ? "OpenAlex" : "Semantic Scholar"}
                    </span>
                    <div className="discovery-actions">
                      <button
                        type="button"
                        className={`discovery-action-btn discovery-import-btn${isImported ? " imported" : ""}`}
                        onClick={() => handleImport(paper)}
                        disabled={isImporting || isImported}
                      >
                        {isImported ? <IconCheck size={12} /> : isImporting ? <IconSpinner size={12} /> : <IconDownload size={12} />}
                        {isImported ? "Đã có trong thư viện" : isImporting ? "Đang thêm..." : "Thêm vào thư viện"}
                      </button>
                      <button
                        type="button"
                        className="discovery-action-btn discovery-detail-btn"
                        onClick={() => setDetailPaper(paper)}
                      >
                        <IconEye size={12} />
                        Chi tiết
                      </button>
                      <button
                        type="button"
                        className="discovery-action-btn discovery-pdf-btn"
                        onClick={() => handleOpenPdf(paper)}
                        title={paper.pdf_url ? "Mở PDF" : "Mở nguồn"}
                      >
                        <IconBookOpen size={12} />
                        {paper.pdf_url ? "Mở PDF" : "Mở nguồn"}
                      </button>
                    </div>
                  </div>
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

      {detailPaper && (
        <div className="rm-modal-overlay" onClick={() => setDetailPaper(null)}>
          <div className="rm-modal rm-modal-detail" onClick={(e) => e.stopPropagation()}>
            <div className="rm-modal-header">
              <h3 className="rm-modal-title">
                <IconInfo size={16} style={{ marginRight: 8 }} />
                Chi tiết bài báo
              </h3>
              <button className="rm-modal-close" onClick={() => setDetailPaper(null)}>✕</button>
            </div>
            <div className="rm-modal-body">
              <div className="detail-section">
                <div className="detail-label">Tiêu đề</div>
                <div className="detail-value detail-title">{detailPaper.title}</div>
              </div>
              <div className="detail-section">
                <div className="detail-label">Tác giả</div>
                <div className="detail-value">{detailPaper.authors.join(", ")}</div>
              </div>
              <div className="detail-row">
                <div className="detail-section">
                  <div className="detail-label">Năm</div>
                  <div className="detail-value">{detailPaper.year || "N/A"}</div>
                </div>
                <div className="detail-section">
                  <div className="detail-label">Trích dẫn</div>
                  <div className="detail-value">{detailPaper.citation_count}</div>
                </div>
                <div className="detail-section">
                  <div className="detail-label">Nguồn</div>
                  <div className="detail-value">{detailPaper.source === "openalex" ? "OpenAlex" : "Semantic Scholar"}</div>
                </div>
              </div>
              {detailPaper.doi && (
                <div className="detail-section">
                  <div className="detail-label">DOI</div>
                  <div className="detail-value"><code>{detailPaper.doi}</code></div>
                </div>
              )}
              {detailPaper.journal && (
                <div className="detail-section">
                  <div className="detail-label">Tạp chí</div>
                  <div className="detail-value">{detailPaper.journal}</div>
                </div>
              )}
              {detailPaper.abstract && (
                <div className="detail-section">
                  <div className="detail-label">Tóm tắt</div>
                  <div className="detail-value detail-abstract">{detailPaper.abstract}</div>
                </div>
              )}
              {getSourceUrl(detailPaper) && (
                <a
                  href={getSourceUrl(detailPaper)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="detail-source-link"
                >
                  <IconLink size={12} />
                  Mở trên {detailPaper.source === "openalex" ? "OpenAlex" : "Semantic Scholar"}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
