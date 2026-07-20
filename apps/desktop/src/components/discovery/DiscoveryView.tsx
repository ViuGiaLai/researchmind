import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DiscoveredPaper } from "../../lib/api";
import { useToast } from "../shared/Toast";
import { IconSearch, IconSpinner, IconDownload, IconCheck, IconSparkle, IconBrain, IconEye, IconLink, IconInfo, IconBookOpen } from "../Icons";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { useDialogFocus } from "../../hooks/useDialogFocus";

const THUMB_GRADIENTS: [string, string][] = [
  ["#f44336", "#e57373"], ["#e91e63", "#f06292"], ["#9c27b0", "#ba68c8"],
  ["#673ab7", "#9575cd"], ["#3f51b5", "#7986cb"], ["#2196f3", "#64b5f6"],
  ["#03a9f4", "#4fc3f7"], ["#009688", "#4db6ac"], ["#4caf50", "#81c784"],
  ["#8bc34a", "#aed581"], ["#ff9800", "#ffb74d"], ["#ff5722", "#ff8a65"],
  ["#795548", "#a1887f"], ["#607d8b", "#90a4ae"], ["#d32f2f", "#ef5350"],
  ["#1976d2", "#42a5f5"], ["#388e3c", "#66bb6a"], ["#f57c00", "#ff9800"],
  ["#455a64", "#78909c"], ["#5d4037", "#8d6e63"],
];

function getThumbPlaceholder(title: string): { letter: string; gradient: string } {
  const clean = title.trim();
  const letter = clean ? clean[0].toUpperCase() : "?";
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) - hash) + clean.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % THUMB_GRADIENTS.length;
  const [c1, c2] = THUMB_GRADIENTS[idx];
  return { letter, gradient: `linear-gradient(135deg, ${c1}, ${c2})` };
}

export const DiscoveryView: React.FC = () => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoveredPaper[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [openAccessOnly, setOpenAccessOnly] = useState(false);
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [translating, setTranslating] = useState(false);
  const [translateMode, setTranslateMode] = useState<"original" | "vi">("original");
  const [translations, setTranslations] = useState<Map<string, { title_vi: string; abstract_vi: string }>>(new Map());
  const [detailPaper, setDetailPaper] = useState<DiscoveredPaper | null>(null);
  const detailDialogRef = useDialogFocus<HTMLDivElement>(Boolean(detailPaper), () => setDetailPaper(null));
  const translateRequestIdRef = useRef(0);
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
      const res = await api.discoverPapers(q, 20, {
        year_from: yearFrom ? Number(yearFrom) : undefined,
        year_to: yearTo ? Number(yearTo) : undefined,
        open_access_only: openAccessOnly,
      });
      setResults(res.results);
    } catch {
      toast.addToast("error", t("discovery.toast_search_error"));
    } finally {
      setSearching(false);
    }
  };

  const saveStrategy = async () => {
    if (!query.trim()) return;
    setSavingStrategy(true);
    try {
      await api.createSavedSearch(query.trim(), query.trim(), {
        year_from: yearFrom ? Number(yearFrom) : null,
        year_to: yearTo ? Number(yearTo) : null,
        tags: openAccessOnly ? ["open-access"] : [],
      });
      toast.addToast("success", t("discovery.strategy_saved"));
    } catch {
      toast.addToast("error", t("discovery.strategy_save_error"));
    } finally {
      setSavingStrategy(false);
    }
  };

  const handleTranslateAll = async () => {
    if (translating) return;
    if (translations.size > 0) {
      setTranslateMode(translateMode === "original" ? "vi" : "original");
      return;
    }
    const requestId = ++translateRequestIdRef.current;
    setTranslating(true);
    try {
      const papers = results.map((r) => ({ title: r.title, abstract: r.abstract }));
      const res = await api.translatePapers(papers);
      if (translateRequestIdRef.current !== requestId) return;
      const map = new Map<string, { title_vi: string; abstract_vi: string }>();
      results.forEach((r, i) => {
        const t = res.translations[i];
        if (t) map.set(r.doi || r.title, t);
      });
      setTranslations(map);
      setTranslateMode("vi");
      toast.addToast("success", t("discovery.toast_translate_success", { count: res.translations.length }));
    } catch {
      if (translateRequestIdRef.current !== requestId) return;
      toast.addToast("error", t("discovery.toast_translate_error"));
    } finally {
      if (translateRequestIdRef.current === requestId) {
        setTranslating(false);
      }
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
      toast.addToast("success", t("discovery.toast_import_success", { title: `${paper.title.slice(0, 50)}...` }));
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("File not found") || msg.includes("file not found") || msg.includes("not found on disk")) {
        toast.addToast("error", t("discovery.toast_pdf_not_found"));
      } else {
        toast.addToast("error", t("discovery.toast_import_error", { title: `${paper.title.slice(0, 40)}...` }));
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
          {t("discovery.title")}
        </h2>
        <p>{t("discovery.description")}</p>
      </div>

      <div className="discovery-search-row">
        <input
          type="text"
          className="discovery-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder={t("discovery.search_placeholder")}
        />
        <button
          type="button"
          className="discovery-search-btn"
          onClick={handleSearch}
          disabled={searching || !query.trim()}
        >
          {searching ? <IconSpinner size={14} /> : <IconSearch size={14} />}
          {searching ? t("discovery.search_btn_loading") : t("discovery.search_btn")}
        </button>
        {searched && results.length > 0 && (
          <button
            type="button"
            className="discovery-translate-btn"
            onClick={handleTranslateAll}
            disabled={translating}
            title={translateMode === "vi" ? t("discovery.translate_off") : t("discovery.translate_on")}
          >
            {translating ? <IconSpinner size={14} /> : <span>{translateMode === "vi" ? "EN" : "VI"}</span>}
          </button>
        )}
      </div>

      <div className="discovery-strategy-row">
        <label>
          <span>{t("discovery.year_from")}</span>
          <input type="number" min="1900" max="2100" value={yearFrom} onChange={(event) => setYearFrom(event.target.value)} placeholder="2000" />
        </label>
        <label>
          <span>{t("discovery.year_to")}</span>
          <input type="number" min="1900" max="2100" value={yearTo} onChange={(event) => setYearTo(event.target.value)} placeholder={String(new Date().getFullYear())} />
        </label>
        <label className="discovery-check">
          <input type="checkbox" checked={openAccessOnly} onChange={(event) => setOpenAccessOnly(event.target.checked)} />
          <span>{t("discovery.open_access_only")}</span>
        </label>
        <button type="button" onClick={() => void saveStrategy()} disabled={!query.trim() || savingStrategy}>
          {savingStrategy ? <IconSpinner size={13} /> : <IconCheck size={13} />}
          {t("discovery.save_strategy")}
        </button>
      </div>

      <div className="discovery-results">
        {searching && (
          <div className="discovery-loading">
            <IconSpinner size={20} />
            <span>{t("discovery.loading")}</span>
          </div>
        )}

        {!searching && searched && results.length === 0 && (
          <div className="discovery-empty">{t("discovery.no_results")}</div>
        )}

        {!searching && results.length > 0 && (
          <>
            <div className="discovery-result-meta">{results.length} {t("discovery.results_count")}</div>
            {results.map((paper, i) => {
              const key = paper.doi || paper.title;
              const isImporting = importing.has(key);
              const isImported = imported.has(key);
              const paperTranslation = translations.get(key);
              const showVi = translateMode === "vi" && paperTranslation;
              const { letter, gradient } = getThumbPlaceholder(paper.title);
              return (
                <div key={`${key}-${i}`} className="discovery-result-card">
                  <div className="discovery-thumb" style={{ background: gradient }}>
                    <span className="discovery-thumb-letter">{letter}</span>
                  </div>
                  <div className="discovery-result-body">
                    <div className="discovery-result-title">
                      {showVi ? paperTranslation!.title_vi : paper.title}
                    </div>
                    <div className="discovery-result-meta">
                      {paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}
                      {paper.year && <span> {"\u00b7"} {paper.year}</span>}
                      {" \u00b7 "}{paper.citation_count} {t("discovery.citations_count")}
                      {paper.journal && <span> {"\u00b7"} {paper.journal}</span>}
                    </div>
                    {(showVi ? paperTranslation!.abstract_vi : paper.abstract) && (
                      <div className="discovery-result-abstract">
                        {showVi ? paperTranslation!.abstract_vi : paper.abstract}
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
                          {isImported ? t("discovery.in_library") : isImporting ? t("discovery.importing") : t("discovery.add_to_library")}
                        </button>
                        <button
                          type="button"
                          className="discovery-action-btn discovery-detail-btn"
                          onClick={() => setDetailPaper(paper)}
                        >
                          <IconEye size={12} />
                          {t("discovery.detail")}
                        </button>
                        <button
                          type="button"
                          className="discovery-action-btn discovery-pdf-btn"
                          onClick={() => handleOpenPdf(paper)}
                          title={paper.pdf_url ? t("discovery.open_pdf") : t("discovery.open_source")}
                        >
                          <IconBookOpen size={12} />
                          {paper.pdf_url ? t("discovery.open_pdf") : t("discovery.open_source")}
                        </button>
                      </div>
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
              {t("discovery.empty_instruction")}
            </p>
          </div>
        )}
      </div>

      {detailPaper && (
        <div className="rm-modal-overlay" onClick={() => setDetailPaper(null)}>
          <div ref={detailDialogRef} className="rm-modal rm-modal-detail" role="dialog" aria-modal="true" aria-labelledby="discovery-detail-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="rm-modal-header">
              <h3 id="discovery-detail-title" className="rm-modal-title">
                <IconInfo size={16} style={{ marginRight: 8 }} />
                {t("discovery.modal_title")}
              </h3>
              <button type="button" className="rm-modal-close" aria-label={t("common.close")} onClick={() => setDetailPaper(null)}>✕</button>
            </div>
            <div className="rm-modal-body">
              <div className="detail-section">
                <div className="detail-label">{t("discovery.field_title")}</div>
                <div className="detail-value detail-title">{translateMode === "vi" && translations.get(detailPaper.doi || detailPaper.title)?.title_vi || detailPaper.title}</div>
              </div>
              <div className="detail-section">
                <div className="detail-label">{t("discovery.field_authors")}</div>
                <div className="detail-value">{detailPaper.authors.join(", ")}</div>
              </div>
              <div className="detail-row">
                <div className="detail-section">
                  <div className="detail-label">{t("discovery.field_year")}</div>
                  <div className="detail-value">{detailPaper.year || "N/A"}</div>
                </div>
                <div className="detail-section">
                  <div className="detail-label">{t("discovery.field_citations")}</div>
                  <div className="detail-value">{detailPaper.citation_count}</div>
                </div>
                <div className="detail-section">
                  <div className="detail-label">{t("discovery.field_source")}</div>
                  <div className="detail-value">{detailPaper.source === "openalex" ? "OpenAlex" : "Semantic Scholar"}</div>
                </div>
              </div>
              {detailPaper.doi && (
                <div className="detail-section">
                  <div className="detail-label">{t("discovery.field_doi")}</div>
                  <div className="detail-value"><code>{detailPaper.doi}</code></div>
                </div>
              )}
              {detailPaper.journal && (
                <div className="detail-section">
                  <div className="detail-label">{t("discovery.field_journal")}</div>
                  <div className="detail-value">{detailPaper.journal}</div>
                </div>
              )}
              {detailPaper.abstract && (
                <div className="detail-section">
                  <div className="detail-label">{t("discovery.field_abstract")}</div>
                  <div className="detail-value detail-abstract">{translateMode === "vi" && translations.get(detailPaper.doi || detailPaper.title)?.abstract_vi || detailPaper.abstract}</div>
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
                  {detailPaper.source === "openalex" ? t("discovery.open_openalex") : t("discovery.open_semantic")}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
