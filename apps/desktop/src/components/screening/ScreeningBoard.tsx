import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { IconCheck, IconClose, IconMinus, IconSpinner, IconSearch, IconError, IconWithText } from "../Icons";

interface ScreeningDecision {
  decision: "include" | "exclude" | "maybe";
  reason?: string;
  updatedAt: number;
}

interface PaperInfo {
  id: string;
  title: string;
  authors: string;
  year: number | null;
}

const STORAGE_KEY = "screening-decisions";

function loadDecisions(): Record<string, ScreeningDecision> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

function saveDecisions(d: Record<string, ScreeningDecision>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
}

type FilterView = "all" | "pending" | "included" | "excluded" | "maybe";

function getFilterLabel(t: (key: string) => string): Record<FilterView, React.ReactNode> {
  return {
    all: t("screening.filter_all"),
    pending: t("screening.filter_pending"),
    included: <IconWithText icon={IconCheck} size={12}>{t("screening.filter_include")}</IconWithText>,
    excluded: <IconWithText icon={IconError} size={12}>{t("screening.filter_exclude")}</IconWithText>,
    maybe: t("screening.filter_unsure"),
  };
}

export const ScreeningBoard: React.FC = () => {
  const { t } = useTranslation();
  const filterLabels = getFilterLabel(t);
  const [papers, setPapers] = useState<PaperInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, ScreeningDecision>>(loadDecisions);
  const [filterView, setFilterView] = useState<FilterView>("all");
  const [searchText, setSearchText] = useState("");
  const [reasonInput, setReasonInput] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    api.listPapers(1, 500).then(data => {
      setPapers(data.papers.map(p => ({
        id: p.id,
        title: p.title || p.filename,
        authors: p.authors || "",
        year: p.year,
      })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const setDecision = useCallback((paperId: string, decision: "include" | "exclude" | "maybe") => {
    setDecisions(prev => {
      const updated = { ...prev, [paperId]: { decision, reason: decision === "exclude" ? (reasonInput[paperId] || "") : prev[paperId]?.reason, updatedAt: Date.now() } };
      saveDecisions(updated);
      return updated;
    });
  }, [reasonInput]);

  const clearDecision = useCallback((paperId: string) => {
    setDecisions(prev => {
      const updated = { ...prev };
      delete updated[paperId];
      saveDecisions(updated);
      return updated;
    });
  }, []);

  const filtered = papers.filter(p => {
    const d = decisions[p.id];
    if (filterView === "pending") return !d;
    if (filterView === "included") return d?.decision === "include";
    if (filterView === "excluded") return d?.decision === "exclude";
    if (filterView === "maybe") return d?.decision === "maybe";
    return true;
  }).filter(p => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.authors.toLowerCase().includes(q);
  });

  const total = papers.length;
  const screened = Object.keys(decisions).length;
  const included = Object.values(decisions).filter(d => d.decision === "include").length;
  const excluded = Object.values(decisions).filter(d => d.decision === "exclude").length;
  const maybe = Object.values(decisions).filter(d => d.decision === "maybe").length;
  const progress = total > 0 ? Math.round((screened / total) * 100) : 0;

  return (
    <div className="rm-page">
      <div className="rm-page-header">
        <h2>{t("screening.title")}</h2>
        <p>{t("screening.desc")}</p>
      </div>

      <div className="rm-progress">
        <div className="rm-progress-label">
          <span>{t("screening.progress", { screened, total, progress })}</span>
          <span>
            <span className="rm-stat-include">{included} {t("screening.stat_include")}</span>
            {" · "}
            <span className="rm-stat-exclude">{excluded} {t("screening.stat_exclude")}</span>
            {" · "}
            <span className="rm-stat-maybe">{maybe} {t("screening.stat_unsure")}</span>
          </span>
        </div>
        <div className="rm-progress-track">
          <div className="rm-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="rm-filter-row">
        <div className="rm-input-wrap">
          <IconSearch size={14} className="rm-input-icon" />
          <input
            type="text"
            className="rm-input rm-input--sm rm-input--search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("screening.search")}
          />
        </div>
        {(["all", "pending", "included", "excluded", "maybe"] as FilterView[]).map(v => (
          <button
            key={v}
            type="button"
            className={`rm-filter-pill${filterView === v ? " active" : ""}`}
            onClick={() => setFilterView(v)}
          >
            {filterLabels[v]}
          </button>
        ))}
      </div>

      <div className="rm-page-body">
        {loading ? (
          <div className="rm-loading">
            <IconSpinner size={20} />
            <span>{t("screening.loading")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rm-empty">
            {searchText ? t("screening.empty") : t("screening.empty_hint")}
          </div>
        ) : (
          <div className="rm-card-list">
            {filtered.map(paper => {
              const d = decisions[paper.id];
              return (
                <div key={paper.id} className="rm-card">
                  <div className="screening-paper-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="rm-card-title">{paper.title}</div>
                      <div className="rm-card-meta">
                        {paper.authors}{paper.year && <span> · {paper.year}</span>}
                      </div>
                    </div>
                    <div className="screening-actions">
                      <button
                        type="button"
                        className={`rm-btn rm-btn--icon rm-btn--include${d?.decision === "include" ? " active" : ""}`}
                        onClick={() => setDecision(paper.id, "include")}
                        title={t("screening.filter_include")}
                      >
                        <IconCheck size={14} />
                      </button>
                      <button
                        type="button"
                        className={`rm-btn rm-btn--icon rm-btn--exclude${d?.decision === "exclude" ? " active" : ""}`}
                        onClick={() => setDecision(paper.id, "exclude")}
                        title={t("screening.filter_exclude")}
                      >
                        <IconClose size={14} />
                      </button>
                      <button
                        type="button"
                        className={`rm-btn rm-btn--icon rm-btn--maybe${d?.decision === "maybe" ? " active" : ""}`}
                        onClick={() => setDecision(paper.id, "maybe")}
                        title={t("screening.filter_unsure")}
                      >
                        <IconMinus size={14} />
                      </button>
                      {d && (
                        <button
                          type="button"
                          className="rm-btn rm-btn--icon rm-btn--xs"
                          onClick={() => clearDecision(paper.id)}
                          title={t("screening.clear")}
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </div>
                  {d?.decision === "exclude" && (
                    <div className="screening-exclude-input">
                      <input
                        type="text"
                        className="rm-input"
                        value={reasonInput[paper.id] !== undefined ? reasonInput[paper.id] : (d.reason || "")}
                        onChange={(e) => setReasonInput(prev => ({ ...prev, [paper.id]: e.target.value }))}
                        onBlur={() => {
                          if (reasonInput[paper.id] !== undefined) {
                            setDecisions(prev => {
                              const existing = prev[paper.id];
                              if (!existing) return prev;
                              const updated = { ...prev, [paper.id]: { ...existing, reason: reasonInput[paper.id], updatedAt: Date.now() } };
                              saveDecisions(updated);
                              return updated;
                            });
                          }
                        }}
                        placeholder={t("screening.reason_placeholder")}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
