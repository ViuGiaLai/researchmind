import React, { useState, useEffect, useCallback } from "react";
import { api, GraphStats, GraphEntity, GraphCommunity, GraphVisualizationData } from "../../lib/api";
import { IconBrain, IconSpinner, IconSearch, IconGraph, IconClear } from "../Icons";
import { GraphVisualizer } from "./GraphVisualizer";

type Strategy = "local" | "global" | "drift";
type Tab = "explore" | "visualize" | "query";

const STRATEGY_LABELS: Record<Strategy, string> = {
  local: "Local Search",
  global: "Global Search",
  drift: "DRIFT Search",
};

const STRATEGY_DESCRIPTIONS: Record<Strategy, string> = {
  local: "Entity-centric: query → entities → neighbors → context → LLM",
  global: "Map-reduce: community reports → partial answers → synthesis",
  drift: "Iterative: start local → extract entities → explore → reduce",
};

interface LoadingState {
  type: "build" | "query" | "general";
  message: string;
}

export const GraphView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("explore");
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState | null>(null);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [communities, setCommunities] = useState<GraphCommunity[]>([]);
  const [graphData, setGraphData] = useState<GraphVisualizationData | null>(null);
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("local");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

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

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleBuild = async () => {
    setLoadingState({ type: "build", message: "Building knowledge graph from paper chunks..." });
    setError("");
    setBuildError(null);
    try {
      const result = await api.buildGraph();
      setStats(result.stats as unknown as GraphStats);
      await refreshAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Build failed";
      setBuildError(msg);
      setError(msg);
    } finally {
      setLoadingState(null);
    }
  };

  const handleClear = async () => {
    setLoadingState({ type: "general", message: "Clearing graph..." });
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
    setLoadingState({ type: "query", message: `Running ${STRATEGY_LABELS[strategy]}...` });
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
      setError(e instanceof Error ? e.message : "Query failed");
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

  return (
    <div className="graph-view">
      <div className="graph-header">
        <div className="graph-header-left">
          <IconBrain size={24} className="icon-gradient" />
          <h2>Knowledge Graph</h2>
        </div>
        <div className="graph-header-actions">
          <button
            className="btn btn-primary"
            onClick={handleBuild}
            disabled={loadingState?.type === "build" || loadingState?.type === "general"}
          >
            {loadingState?.type === "build" ? <IconSpinner size={16} /> : <IconGraph size={16} />}
            {loadingState?.type === "build" ? " Building..." : " Build Graph"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleClear}
            disabled={loadingState !== null || !stats}
          >
            <IconClear size={16} />
            {" Clear"}
          </button>
        </div>
      </div>

      {/* Loading banner */}
      {loadingState && (
        <div className="graph-loading-banner">
          <IconSpinner size={16} />
          <span>{loadingState.message}</span>
        </div>
      )}

      {/* Error banner (build-level) */}
      {buildError && (
        <div className="graph-error">
          Build failed: {buildError}
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="graph-stats-bar">
          <div className="stat-item">
            <span className="stat-value">{stats.entities}</span>
            <span className="stat-label">Entities</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.relationships}</span>
            <span className="stat-label">Relationships</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.communities}</span>
            <span className="stat-label">Communities</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.community_reports}</span>
            <span className="stat-label">Reports</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.text_units}</span>
            <span className="stat-label">Text Units</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!stats && !loadingState && (
        <div className="graph-empty">
          <IconGraph size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <h3>Knowledge Graph chưa có dữ liệu</h3>
          <p>Click "Build Graph" để trích xuất entities và relationships từ các paper chunks.</p>
          <p style={{ fontSize: "0.8rem", marginTop: 8, color: "var(--color-text-muted)" }}>
            Quá trình này gọi LLM để phân tích từng chunk và xây dựng knowledge graph có cấu trúc.
          </p>
        </div>
      )}

      {/* Tabs — only show when graph has data or is building */}
      {(stats || loadingState?.type === "build") && (
        <>
          <div className="graph-tabs">
            {(["explore", "visualize", "query"] as Tab[]).map((tab) => (
              <button
                key={tab}
                className={`graph-tab ${activeTab === tab ? "active" : ""}`}
                onClick={() => handleTabClick(tab)}
                disabled={!stats}
              >
                {tab === "explore" && "Explore"}
                {tab === "visualize" && "Visualize"}
                {tab === "query" && "Query"}
              </button>
            ))}
          </div>

          {/* Explore tab */}
          {activeTab === "explore" && (
            <div className="graph-explore">
              {entities.length > 0 && (
                <div className="graph-section">
                  <h3>Entities ({entities.length})</h3>
                  <div className="entity-list">
                    {entities.map((e) => (
                      <div key={e.id} className="entity-card">
                        <div className="entity-title">{e.title}</div>
                        <div className="entity-meta">
                          <span className="entity-type">{e.type || "concept"}</span>
                          <span className="entity-rank">rank: {e.rank.toFixed(1)}</span>
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
                <div className="graph-empty-text">No entities found. Build the graph first.</div>
              )}

              {communities.length > 0 && (
                <div className="graph-section">
                  <h3>Communities ({communities.length})</h3>
                  <div className="community-list">
                    {communities.map((c) => (
                      <div key={c.id} className="community-card">
                        <div className="community-title">{c.title}</div>
                        <div className="community-meta">
                          <span>Level {c.level}</span>
                          <span>{c.size} entities</span>
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
                    {graphData.nodes.length} nodes · {graphData.edges.length} edges
                    <span className="graph-viz-hint">Click node để xem chi tiết · Double-click để fit view</span>
                  </div>
                  <GraphVisualizer data={graphData} />
                </div>
              ) : (
                <div className="graph-empty-text">
                  {stats ? "No graph data to visualize. Entities may have been extracted without relationships." : "Build the graph first."}
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
                  {(Object.entries(STRATEGY_LABELS) as [Strategy, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <p className="strategy-desc">{STRATEGY_DESCRIPTIONS[strategy]}</p>
              </div>

              <div className="query-input-row">
                <input
                  type="text"
                  className="query-input"
                  placeholder="Ask a question about your research knowledge graph..."
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
                  {loadingState?.type === "query" ? " Running..." : " Ask"}
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
