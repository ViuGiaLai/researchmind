import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, GraphStats, GraphEntity, GraphCommunity, GraphVisualizationData } from "../../lib/api";
import { IconBrain, IconSpinner, IconSearch, IconGraph, IconClear } from "../Icons";
import { GraphVisualizer } from "./GraphVisualizer";

type Strategy = "local" | "global" | "drift";
type Tab = "explore" | "visualize" | "query";

const STRATEGY_LABELS = (t: (key: string) => string): Record<Strategy, string> => ({
  local: t("graph.strategy_local"),
  global: t("graph.strategy_global"),
  drift: t("graph.strategy_drift"),
});

const STRATEGY_DESCRIPTIONS = (t: (key: string) => string): Record<Strategy, string> => ({
  local: t("graph.strategy_local_desc"),
  global: t("graph.strategy_global_desc"),
  drift: t("graph.strategy_drift_desc"),
});

interface BuildProgress {
  phase: string;
  current: number;
  total: number;
  percent: number;
  message: string;
}

interface LoadingState {
  type: "build" | "query" | "general";
  message: string;
  percent?: number;
}

export const GraphView: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("explore");
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState | null>(null);
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [communities, setCommunities] = useState<GraphCommunity[]>([]);
  const [graphData, setGraphData] = useState<GraphVisualizationData | null>(null);
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("local");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const buildFinishedRef = React.useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await api.getGraphStats();
      setStats(s);
      setBuildError(null);
    } catch {
      setStats(null);
    }
  }, []);

  const loadEntities = useCallback(async () => {
    try {
      const e = await api.listGraphEntities(100, 0);
      setEntities(e);
    } catch {
      setEntities([]);
    }
  }, []);

  const loadCommunities = useCallback(async () => {
    try {
      const c = await api.listGraphCommunities();
      setCommunities(c);
    } catch {
      setCommunities([]);
    }
  }, []);

  const loadGraphData = useCallback(async () => {
    try {
      const d = await api.getGraphVisualizationData();
      setGraphData(d);
    } catch {
      setGraphData(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await loadStats();
    if (activeTab === "explore") {
      await Promise.all([loadEntities(), loadCommunities()]);
    }
    if (activeTab === "visualize") {
      await loadGraphData();
    }
  }, [activeTab, loadStats, loadEntities, loadCommunities, loadGraphData]);

  const finishBuildUi = useCallback(async (phase: string, message?: string) => {
    if (buildFinishedRef.current) return;
    buildFinishedRef.current = true;
    stopPolling();
    setLoadingState(null);

    if (phase === "done") {
      setBuildError(null);
      try {
        const s = await api.getGraphStats();
        setStats(s);
        await refreshAll();
      } catch {
        // ignore
      }
    } else if (phase === "cancelled") {
      setBuildError(message || t("graph.build_cancelled"));
      try {
        const s = await api.getGraphStats();
        if (s.entities > 0) {
          setStats(s);
          await refreshAll();
        }
      } catch {
        // ignore
      }
    } else if (phase === "error") {
      setBuildError(message || t("graph.build_failed"));
      setError(message || t("graph.build_failed"));
    }
  }, [refreshAll, stopPolling]);

  const startPolling = useCallback(() => {
    buildFinishedRef.current = false;
    pollRef.current = setInterval(async () => {
      try {
        const p = await api.getBuildProgress();
        setBuildProgress(p);
        setLoadingState((prev) =>
          prev?.type === "build"
            ? { ...prev, percent: p.percent, message: p.message }
            : prev,
        );

        if (p.phase === "done" || p.phase === "cancelled" || p.phase === "error") {
          await finishBuildUi(p.phase, p.message);
        }
      } catch {
        // ignore poll errors
      }
    }, 500);
  }, [finishBuildUi]);

  useEffect(() => {
    loadStats();
    (async () => {
      try {
        const p = await api.getBuildProgress();
        if (p.phase === "extract" || p.phase === "cluster" || p.phase === "summarize" || p.phase === "cancelling") {
          setBuildProgress(p);
          setLoadingState({ type: "build", message: p.message, percent: p.percent });
          startPolling();
        }
      } catch {
        // ignore
      }
    })();
  }, [loadStats, startPolling]);

  // Auto-load explore data when switching tab with existing stats
  useEffect(() => {
    if (!stats || loadingState) return;
    if (activeTab === "explore") {
      loadEntities();
      loadCommunities();
    }
    if (activeTab === "visualize") {
      loadGraphData();
    }
  }, [activeTab, stats, loadingState]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleBuild = async () => {
    setBuildProgress(null);
    setLoadingState({ type: "build", message: t("graph.build_starting") });
    setError("");
    setBuildError(null);

    startPolling();

    try {
      const started = await api.buildGraph();
      setBuildProgress({
        phase: "extract",
        current: 0,
        total: started.total_chunks ?? 0,
        percent: 0,
        message: started.message,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("graph.build_start_error");
      stopPolling();
      setLoadingState(null);
      setBuildError(msg);
      setError(msg);
    }
  };

  const handleCancel = async () => {
    try {
      await api.cancelBuild();
      setBuildProgress((prev) =>
        prev
          ? { ...prev, phase: "cancelling", message: t("graph.build_cancelling") }
          : { phase: "cancelling", current: 0, total: 0, percent: 0, message: t("graph.build_cancelling_short") },
      );
    } catch {
      // ignore
    }
  };

  const handleClear = async () => {
    setLoadingState({ type: "general", message: t("graph.delete_graph") });
    try {
      await api.clearGraph();
      setStats(null);
      setEntities([]);
      setCommunities([]);
      setGraphData(null);
      setAnswer("");
      setBuildError(null);
      setError("");
    } catch {
      // ignore
    } finally {
      setLoadingState(null);
    }
  };

  const handleQuery = async () => {
    if (!query.trim()) return;
    setLoadingState({ type: "query", message: t("graph.running_strategy", { strategy: STRATEGY_LABELS(t)[strategy] }) });
    setError("");
    setAnswer("");
    try {
      const result = await api.queryGraph(query.trim(), strategy, {
        topKEntities: 10,
        topKRelationships: 10,
        maxDriftSteps: 3,
      });
      setAnswer(result.answer);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("graph.query_failed"));
    } finally {
      setLoadingState(null);
    }
  };

  const handleTabClick = async (tab: Tab) => {
    setActiveTab(tab);
    setError("");
    if (tab === "explore") {
      await Promise.all([loadEntities(), loadCommunities()]);
    }
    if (tab === "visualize") {
      await loadGraphData();
    }
  };

  const isBuilding = loadingState?.type === "build";

  return (
    <div className="graph-view">
      <div className="graph-header">
        <div className="graph-header-left">
          <IconBrain size={24} className="icon-gradient" />
          <h2>{t("graph.title")}</h2>
        </div>
        <div className="graph-header-actions">
          <button
            className="btn btn-primary"
            onClick={handleBuild}
            disabled={isBuilding || loadingState?.type === "general"}
          >
            {isBuilding ? <IconSpinner size={16} /> : <IconGraph size={16} />}
            {isBuilding ? t("graph.building") : t("graph.build")}
          </button>
          {isBuilding && (
            <button className="btn btn-danger" onClick={handleCancel}>
              {t("graph.stop")}
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={handleClear}
            disabled={loadingState !== null || !stats}
          >
            <IconClear size={16} />
            {t("graph.delete")}
          </button>
        </div>
      </div>

      {/* Build progress bar */}
      {isBuilding && buildProgress && (
        <div className="graph-build-progress">
          <div className="graph-progress-bar-container">
            <div
              className="graph-progress-bar"
              style={{ width: `${Math.max(buildProgress.percent, 2)}%` }}
            />
          </div>
          <div className="graph-progress-info">
            <span className="graph-progress-message">{buildProgress.message}</span>
            <span className="graph-progress-pct">{buildProgress.percent}%</span>
          </div>
        </div>
      )}

      {/* Error banner (build-level) */}
      {buildError && (
        <div className="graph-error">
          {buildError}
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="graph-stats-bar">
          <div className="stat-item">
            <span className="stat-value">{stats.entities}</span>
            <span className="stat-label">{t("graph.stat_entities")}</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.relationships}</span>
            <span className="stat-label">{t("graph.stat_relations")}</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.communities}</span>
            <span className="stat-label">{t("graph.stat_communities")}</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.community_reports}</span>
            <span className="stat-label">{t("graph.stat_reports")}</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.text_units}</span>
            <span className="stat-label">{t("graph.stat_text_units")}</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!stats && !loadingState && (
        <div className="graph-empty">
          <IconGraph size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <h3>{t("graph.empty_heading")}</h3>
          <p>{t("graph.empty_text")}</p>
          <p style={{ fontSize: "0.8rem", marginTop: 8, color: "var(--color-text-muted)" }}>
            {t("graph.empty_hint")}
          </p>
        </div>
      )}

      {/* Tabs — only show when graph has data or is building */}
      {(stats || isBuilding) && (
        <>
          <div className="graph-tabs">
            {(["explore", "visualize", "query"] as Tab[]).map((tab) => (
              <button
                key={tab}
                className={`graph-tab ${activeTab === tab ? "active" : ""}`}
                onClick={() => handleTabClick(tab)}
                disabled={!stats && !isBuilding}
              >
                {tab === "explore" && t("graph.tab_explore")}
                {tab === "visualize" && t("graph.tab_display")}
                {tab === "query" && t("graph.tab_query")}
              </button>
            ))}
          </div>

          {/* Explore tab */}
          {activeTab === "explore" && (
            <div className="graph-explore">
              {entities.length > 0 && (
                <div className="graph-section">
                  <h3>{t("graph.entity_section", { n: entities.length })}</h3>
                  <div className="entity-list">
                    {entities.map((e) => (
                      <div key={e.id} className="entity-card">
                        <div className="entity-title">{e.title}</div>
                        <div className="entity-meta">
                          <span className="entity-type">{e.type || t("graph.entity_type_fallback")}</span>
                          <span className="entity-rank">điểm: {e.rank.toFixed(1)}</span>
                        </div>
                        {e.description && (
                          <div className="entity-desc">{e.description.slice(0, 200)}</div>
                        )}
                        {e.relationships.length > 0 && (
                          <div className="entity-rels">
                            {e.relationships.slice(0, 5).map((r, i) => (
                              <span key={i} className="rel-tag">
                                {r.source} → {r.target}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {entities.length === 0 && stats && (
                <div className="graph-empty-text">{t("graph.no_entities")}</div>
              )}

              {communities.length > 0 && (
                <div className="graph-section">
                  <h3>{t("graph.community_section", { n: communities.length })}</h3>
                  <div className="community-list">
                    {communities.map((c) => (
                      <div key={c.id} className="community-card">
                        <div className="community-title">{c.title}</div>
                        <div className="community-meta">
                          <span>{t("graph.community_level", { n: c.level })}</span>
                          <span>{t("graph.community_size", { n: c.size })}</span>
                        </div>
                        {c.report && (
                          <div className="community-report">{c.report.slice(0, 200)}...</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Visualize tab — interactive graph visualization */}
          {activeTab === "visualize" && (
            <div className="graph-visualize">
              {graphData && graphData.nodes.length > 0 ? (
                <div className="graph-viz-wrapper">
                  <div className="graph-viz-info">
                    {t("graph.graph_info", { nodes: graphData.nodes.length, edges: graphData.edges.length })}
                    <span className="graph-viz-hint">{t("graph.graph_hint")}</span>
                  </div>
                  <GraphVisualizer data={graphData} />
                </div>
              ) : (
                <div className="graph-empty-text">
                  {stats ? t("graph.graph_empty") : t("graph.graph_empty_hint")}
                </div>
              )}
            </div>
          )}

          {/* Query tab */}
          {activeTab === "query" && (
            <div className="graph-query">
              <div className="query-controls">
                <select
                  className="strategy-select"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as Strategy)}
                  disabled={loadingState?.type === "query"}
                >
                  {(Object.entries(STRATEGY_LABELS(t)) as [Strategy, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <p className="strategy-desc">{STRATEGY_DESCRIPTIONS(t)[strategy]}</p>
              </div>

              <div className="query-input-row">
                <input
                  type="text"
                  className="query-input"
                  placeholder={t("graph.query_placeholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                  disabled={loadingState?.type === "query"}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleQuery}
                  disabled={loadingState !== null || !query.trim()}
                >
                  {loadingState?.type === "query" ? <IconSpinner size={16} /> : <IconSearch size={16} />}
                  {loadingState?.type === "query" ? t("graph.query_btn_loading") : t("graph.query_btn")}
                </button>
              </div>

              {error && <div className="graph-error">{error}</div>}

              {answer && (
                <div className="query-answer">
                  <div className="answer-content">{answer}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
