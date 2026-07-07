import React, { useState, useEffect, useCallback } from "react";
import { api, GraphStats, GraphEntity, GraphCommunity, GraphVisualizationData } from "../../lib/api";
import { IconBrain, IconSpinner, IconSearch, IconGraph, IconClear } from "../Icons";
import { GraphVisualizer } from "./GraphVisualizer";

type Strategy = "local" | "global" | "drift";
type Tab = "explore" | "visualize" | "query";

const STRATEGY_LABELS: Record<Strategy, string> = {
  local: "Tìm kiếm cục bộ",
  global: "Tìm kiếm toàn cục",
  drift: "Tìm kiếm DRIFT",
};

const STRATEGY_DESCRIPTIONS: Record<Strategy, string> = {
  local: "Dựa trên thực thể: truy vấn → thực thể → hàng xóm → ngữ cảnh → LLM",
  global: "Map-reduce: báo cáo cộng đồng → câu trả lời cục bộ → tổng hợp",
  drift: "Lặp: bắt đầu cục bộ → trích thực thể → khám phá → thu gọn",
};

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
      setBuildError(message || "Đã hủy xây dựng sơ đồ");
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
      setBuildError(message || "Xây dựng sơ đồ thất bại");
      setError(message || "Xây dựng sơ đồ thất bại");
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
    setLoadingState({ type: "build", message: "Đang khởi động..." });
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
      const msg = e instanceof Error ? e.message : "Không thể bắt đầu xây dựng sơ đồ";
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
          ? { ...prev, phase: "cancelling", message: "Đang hủy — dừng các chunk đang xử lý..." }
          : { phase: "cancelling", current: 0, total: 0, percent: 0, message: "Đang hủy..." },
      );
    } catch {
      // ignore
    }
  };

  const handleClear = async () => {
    setLoadingState({ type: "general", message: "Đang xóa đồ thị..." });
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
    setLoadingState({ type: "query", message: `Đang chạy ${STRATEGY_LABELS[strategy]}...` });
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
      setError(e instanceof Error ? e.message : "Truy vấn thất bại");
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
          <h2>Sơ đồ tri thức</h2>
        </div>
        <div className="graph-header-actions">
          <button
            className="btn btn-primary"
            onClick={handleBuild}
            disabled={isBuilding || loadingState?.type === "general"}
          >
            {isBuilding ? <IconSpinner size={16} /> : <IconGraph size={16} />}
            {isBuilding ? " Đang xây dựng..." : " Xây dựng Sơ đồ"}
          </button>
          {isBuilding && (
            <button className="btn btn-danger" onClick={handleCancel}>
              Dừng
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={handleClear}
            disabled={loadingState !== null || !stats}
          >
            <IconClear size={16} />
            {" Xóa"}
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
            <span className="stat-label">Thực thể</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.relationships}</span>
            <span className="stat-label">Mối quan hệ</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.communities}</span>
            <span className="stat-label">Cộng đồng</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.community_reports}</span>
            <span className="stat-label">Báo cáo</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.text_units}</span>
            <span className="stat-label">Đơn vị văn bản</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!stats && !loadingState && (
        <div className="graph-empty">
          <IconGraph size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <h3>Đồ thị tri thức chưa có dữ liệu</h3>
          <p>Nhấn "Build Graph" để trích xuất thực thể và quan hệ từ các đoạn bài báo.</p>
          <p style={{ fontSize: "0.8rem", marginTop: 8, color: "var(--color-text-muted)" }}>
            Quá trình này gọi LLM để phân tích từng đoạn và xây dựng đồ thị tri thức có cấu trúc.
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
                {tab === "explore" && "Khám phá"}
                {tab === "visualize" && "Hiển thị"}
                {tab === "query" && "Truy vấn"}
              </button>
            ))}
          </div>

          {/* Explore tab */}
          {activeTab === "explore" && (
            <div className="graph-explore">
              {entities.length > 0 && (
                <div className="graph-section">
                  <h3>Thực thể ({entities.length})</h3>
                  <div className="entity-list">
                    {entities.map((e) => (
                      <div key={e.id} className="entity-card">
                        <div className="entity-title">{e.title}</div>
                        <div className="entity-meta">
                          <span className="entity-type">{e.type || "khái niệm"}</span>
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
                <div className="graph-empty-text">Không tìm thấy thực thể nào.</div>
              )}

              {communities.length > 0 && (
                <div className="graph-section">
                  <h3>Cộng đồng ({communities.length})</h3>
                  <div className="community-list">
                    {communities.map((c) => (
                      <div key={c.id} className="community-card">
                        <div className="community-title">{c.title}</div>
                        <div className="community-meta">
                          <span>Cấp {c.level}</span>
                          <span>{c.size} thực thể</span>
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
                    {graphData.nodes.length} nút · {graphData.edges.length} cạnh
                    <span className="graph-viz-hint">Nhấp node để xem chi tiết · Nháy đúp để vừa khung</span>
                  </div>
                  <GraphVisualizer data={graphData} />
                </div>
              ) : (
                <div className="graph-empty-text">
                  {stats ? "Không có dữ liệu đồ thị để hiển thị. Có thể đã trích xuất thực thể nhưng chưa có quan hệ." : "Hãy xây dựng đồ thị trước."}
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
                  placeholder="Hỏi một câu về đồ thị kiến thức nghiên cứu của bạn..."
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
                  {loadingState?.type === "query" ? " Đang truy vấn..." : " Hỏi"}
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
