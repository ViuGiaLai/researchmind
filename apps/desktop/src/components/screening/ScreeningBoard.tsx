import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api";
import { IconCheck, IconClose, IconMinus, IconSpinner, IconSearch } from "../Icons";

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

export const ScreeningBoard: React.FC = () => {
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "20px", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "1.2rem" }}>
          Sàng lọc bài báo
        </h2>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--color-text-muted, #94a3b8)" }}>
          Include / Exclude / Maybe để chọn bài báo cho systematic review
        </p>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", marginBottom: "4px" }}>
          <span>{screened}/{total} bài đã sàng lọc ({progress}%)</span>
          <span>
            <span style={{ color: "#10b981" }}>{included} Include</span>
            {" · "}
            <span style={{ color: "#ef4444" }}>{excluded} Exclude</span>
            {" · "}
            <span style={{ color: "#f59e0b" }}>{maybe} Maybe</span>
          </span>
        </div>
        <div style={{ height: "6px", borderRadius: "3px", background: "var(--color-border, #282828)", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: "3px",
            background: "linear-gradient(90deg, #10b981, #6366f1)",
            transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "150px" }}>
          <IconSearch size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted, #94a3b8)", pointerEvents: "none" }} />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm trong tiêu đề..."
            style={{
              width: "100%",
              padding: "6px 10px 6px 32px",
              borderRadius: "6px",
              border: "1px solid var(--color-border, #282828)",
              background: "var(--color-surface, #141414)",
              color: "var(--color-text, #e4e4e7)",
              fontSize: "0.82rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        {(["all", "pending", "included", "excluded", "maybe"] as FilterView[]).map(v => (
          <button
            key={v}
            onClick={() => setFilterView(v)}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              border: "1px solid var(--color-border, #333)",
              background: filterView === v ? "rgba(99, 102, 241, 0.1)" : "transparent",
              color: filterView === v ? "var(--color-primary, #6366f1)" : "var(--color-text-muted, #94a3b8)",
              cursor: "pointer",
              fontSize: "0.78rem",
              fontWeight: filterView === v ? 600 : 400,
              transition: "all 0.15s",
            }}
          >
            {v === "all" ? "Tất cả" : v === "pending" ? "Chưa xử lý" : v === "included" ? "✅ Include" : v === "excluded" ? "❌ Exclude" : "🤔 Maybe"}
          </button>
        ))}
      </div>

      {/* Paper List */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: "12px", color: "var(--color-text-muted, #94a3b8)" }}>
            <IconSpinner size={20} />
            <span>Đang tải danh sách bài báo...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-muted, #94a3b8)", fontSize: "0.9rem" }}>
            {searchText ? "Không tìm thấy bài báo nào." : "Chưa có bài báo nào. Import bài báo vào thư viện trước."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {filtered.map(paper => {
              const d = decisions[paper.id];
              const includeBtn = { bg: d?.decision === "include" ? "rgba(16, 185, 129, 0.12)" : "transparent", color: d?.decision === "include" ? "#10b981" : "var(--color-text-muted, #94a3b8)", border: d?.decision === "include" ? "1px solid #10b981" : "1px solid var(--color-border, #333)" };
              const excludeBtn = { bg: d?.decision === "exclude" ? "rgba(239, 68, 68, 0.12)" : "transparent", color: d?.decision === "exclude" ? "#ef4444" : "var(--color-text-muted, #94a3b8)", border: d?.decision === "exclude" ? "1px solid #ef4444" : "1px solid var(--color-border, #333)" };
              const maybeBtn = { bg: d?.decision === "maybe" ? "rgba(245, 158, 11, 0.12)" : "transparent", color: d?.decision === "maybe" ? "#f59e0b" : "var(--color-text-muted, #94a3b8)", border: d?.decision === "maybe" ? "1px solid #f59e0b" : "1px solid var(--color-border, #333)" };

              return (
                <div
                  key={paper.id}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border, #282828)",
                    background: "var(--color-surface, #141414)",
                  }}
                >
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--color-text, #e4e4e7)", marginBottom: "2px" }}>
                        {paper.title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #94a3b8)" }}>
                        {paper.authors}{paper.year && <span> &middot; {paper.year}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                      <button onClick={() => setDecision(paper.id, "include")} style={{ ...btnBase, ...includeBtn }} title="Include">
                        <IconCheck size={14} />
                      </button>
                      <button onClick={() => setDecision(paper.id, "exclude")} style={{ ...btnBase, ...excludeBtn }} title="Exclude">
                        <IconClose size={14} />
                      </button>
                      <button onClick={() => setDecision(paper.id, "maybe")} style={{ ...btnBase, ...maybeBtn }} title="Maybe">
                        <IconMinus size={14} />
                      </button>
                      {d && <button onClick={() => clearDecision(paper.id)} style={{ ...btnBase, background: "transparent", border: "1px solid var(--color-border, #333)", color: "var(--color-text-muted, #555)", fontSize: "0.7rem" }} title="Clear">↺</button>}
                    </div>
                  </div>
                  {d?.decision === "exclude" && (
                    <div style={{ marginTop: "8px", paddingLeft: "14px" }}>
                      <input
                        type="text"
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
                        placeholder="Lý do loại trừ..."
                        style={{
                          width: "100%",
                          padding: "5px 10px",
                          borderRadius: "4px",
                          border: "1px solid var(--color-border, #282828)",
                          background: "rgba(239, 68, 68, 0.04)",
                          color: "var(--color-text, #e4e4e7)",
                          fontSize: "0.78rem",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
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

const btnBase: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: "4px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  transition: "all 0.1s",
  fontSize: "0.78rem",
};
