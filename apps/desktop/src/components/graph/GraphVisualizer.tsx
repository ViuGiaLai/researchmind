import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Network, type Options } from "vis-network";
import { DataSet } from "vis-data";
import { api, GraphEntity, GraphVisualizationData } from "../../lib/api";
import { IconClose, IconSpinner } from "../Icons";

const COMMUNITY_COLORS = [
  "#00e5ff", // Bright Luminous Cyan
  "#a855f7", // Neon Purple/Violet
  "#3b82f6", // Electric Blue
  "#10b981", // Emerald Green
  "#ff9800", // Vibrant Gold Orange
  "#f43f5e", // Rose Pink
  "#fbc02d", // Luminous Yellow
  "#d946ef", // Fuchsia
  "#84cc16", // Lime Green
  "#ff6b6b", // Coral Red
  "#6366f1", // Electric Indigo
  "#00bcd4", // Cyan/Teal
];

function getCommunityColor(communityId: string | null): string {
  if (!communityId) return "#737373";
  let hash = 0;
  for (let i = 0; i < communityId.length; i++) {
    hash = ((hash << 5) - hash) + communityId.charCodeAt(i);
    hash |= 0;
  }
  return COMMUNITY_COLORS[Math.abs(hash) % COMMUNITY_COLORS.length];
}

function getNodeColor(nodeId: string): string {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) {
    hash = ((hash << 5) - hash) + nodeId.charCodeAt(i);
    hash |= 0;
  }
  return COMMUNITY_COLORS[Math.abs(hash) % COMMUNITY_COLORS.length];
}

function getNetworkOptions(isLightMode: boolean): Options {
  return {
    physics: {
      stabilization: { iterations: 120, updateInterval: 20 },
      solver: "forceAtlas2Based",
      forceAtlas2Based: {
        gravitationalConstant: -50,
        centralGravity: 0.01,
        springLength: 140,
        springConstant: 0.05,
        damping: 0.4,
        avoidOverlap: 1,
      },
    },
    edges: {
      smooth: { enabled: true, type: "continuous", roundness: 0.5 },
      font: {
        size: 9,
        color: isLightMode ? "rgba(15, 23, 42, 0.6)" : "rgba(255, 255, 255, 0.4)",
        strokeWidth: 0,
      },
      arrows: { to: { enabled: false } },
      color: {
        color: isLightMode ? "rgba(15, 23, 42, 0.08)" : "rgba(255, 255, 255, 0.12)",
        highlight: isLightMode ? "rgba(15, 23, 42, 0.4)" : "rgba(255, 255, 255, 0.5)",
        hover: isLightMode ? "rgba(15, 23, 42, 0.2)" : "rgba(255, 255, 255, 0.3)",
        inherit: "from",
      },
    },
    nodes: {
      shape: "dot",
      font: {
        size: 11,
        color: isLightMode ? "#0f172a" : "#dae2fd",
        face: "Plus Jakarta Sans, Inter, sans-serif",
        strokeWidth: 0,
      },
      borderWidth: 2,
      shadow: { enabled: true, color: "rgba(0, 0, 0, 0.3)", size: 6, x: 0, y: 3 },
      chosen: {
        node: (values: any, id: any, selected: boolean, hovering: boolean) => {
          if (selected) {
            values.size = values.size * 1.25;
            values.borderWidth = 3;
            values.borderColor = isLightMode ? "#0f172a" : "#ffffff";
            values.shadowSize = 14;
          } else if (hovering) {
            values.size = values.size * 1.12;
            values.borderWidth = 3;
            values.borderColor = isLightMode ? "#0f172a" : "#ffffff";
            values.shadowSize = 10;
          }
        },
        label: (values: any, id: any, selected: boolean, hovering: boolean) => {
          if (selected) {
            values.color = isLightMode ? "#000000" : "#ffffff";
            values.size = values.size + 1;
          } else if (hovering) {
            values.color = isLightMode ? "#000000" : "#ffffff";
          }
        }
      }
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      navigationButtons: true,
      keyboard: true,
    },
    layout: {
      improvedLayout: true,
    },
    height: "100%",
    width: "100%",
  };
}

interface EntityDetail {
  entity: GraphEntity;
  relationships: { source: string; target: string; weight: number; description?: string }[];
}

function EntityDetailPanel({
  detail,
  onClose,
}: {
  detail: EntityDetail;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="graph-detail-panel">
      <div className="graph-detail-header">
        <h3>{detail.entity.title}</h3>
        <button className="graph-detail-close" onClick={onClose}>
          <IconClose size={16} />
        </button>
      </div>
      <div className="graph-detail-body">
        <div className="graph-detail-field">
          <span className="graph-detail-label">{t("graph.entity_type")}</span>
          <span className="graph-detail-value">
            <span className="entity-type">{detail.entity.type || "concept"}</span>
          </span>
        </div>
        <div className="graph-detail-field">
          <span className="graph-detail-label">{t("graph.entity_rank")}</span>
          <span className="graph-detail-value">{detail.entity.rank.toFixed(2)}</span>
        </div>
        {detail.entity.description && (
          <div className="graph-detail-field">
            <span className="graph-detail-label">{t("graph.entity_description")}</span>
            <p className="graph-detail-desc">{detail.entity.description}</p>
          </div>
        )}
        {detail.entity.community_ids.length > 0 && (
          <div className="graph-detail-field">
            <span className="graph-detail-label">{t("graph.entity_communities")}</span>
            <div className="graph-detail-communities">
              {detail.entity.community_ids.map((cid) => (
                <span
                  key={cid}
                  className="community-badge"
                  style={{ background: getCommunityColor(cid) + "33", color: getCommunityColor(cid) }}
                >
                  {cid.slice(0, 8)}
                </span>
              ))}
            </div>
          </div>
        )}
        {detail.relationships.length > 0 && (
          <div className="graph-detail-field">
            <span className="graph-detail-label">{t("graph.entity_relationships", { count: detail.relationships.length })}</span>
            <div className="graph-detail-rels">
              {detail.relationships.slice(0, 20).map((r, i) => (
                <div key={i} className="graph-detail-rel">
                  <span className="rel-direction">{r.source} → {r.target}</span>
                  <span className="rel-weight">w={r.weight.toFixed(1)}</span>
                  {r.description && (
                    <span className="rel-desc">{r.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function GraphVisualizer({ data }: { data: GraphVisualizationData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [isLightMode, setIsLightMode] = useState(
    document.documentElement.getAttribute("data-theme") === "light"
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      setIsLightMode(isLight);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  const handleNodeClick = useCallback(async (entityTitle: string) => {
    setDetailLoading(true);
    try {
      const entity = await api.getGraphEntity(entityTitle);
      setDetail({
        entity,
        relationships: entity.relationships,
      });
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Ref to avoid stale closure in vis-network click handler
  const handleNodeClickRef = useRef(handleNodeClick);
  handleNodeClickRef.current = handleNodeClick;

  useEffect(() => {
    if (!containerRef.current) return;

    const nodes = new DataSet(
      data.nodes.map((n) => {
        const baseColor = getNodeColor(n.id);
        return {
          id: n.id,
          label: n.label,
          title: `${n.label} (${n.type}, rank=${n.rank.toFixed(1)})`,
          value: n.rank,
          color: {
            background: baseColor,
            border: isLightMode ? "rgba(15, 23, 42, 0.15)" : "rgba(255, 255, 255, 0.25)",
            highlight: { background: baseColor, border: isLightMode ? "#0f172a" : "#ffffff" },
            hover: { background: baseColor, border: isLightMode ? "#0f172a" : "#ffffff" },
          },
          // Soft radial glow matching the node's unique neon color
          shadow: {
            enabled: true,
            color: baseColor + (isLightMode ? "66" : "aa"), // Softer shadow in light mode, bloom in dark
            size: Math.max(12, Math.min(26, 10 + n.rank * 1.8)),
            x: 0,
            y: 0,
          },
          size: Math.max(12, Math.min(38, 12 + n.rank * 3)),
          font: { size: Math.max(10, Math.min(15, 9 + n.rank * 1.5)) },
        };
      })
    );

    const edges = new DataSet(
      data.edges.map((e, i) => ({
        id: `e${i}`,
        from: data.nodes.find((n) => n.label === e.source)?.id || e.source,
        to: data.nodes.find((n) => n.label === e.target)?.id || e.target,
        label: e.weight >= 0.7 ? e.weight.toFixed(1) : undefined,
        value: e.weight,
        width: Math.max(0.5, e.weight * 2.5),
        title: e.description ? `${e.description} (w=${e.weight.toFixed(1)})` : `w=${e.weight.toFixed(1)}`,
        color: {
          color: isLightMode ? "rgba(15, 23, 42, 0.08)" : "rgba(255, 255, 255, 0.12)",
          highlight: isLightMode ? "rgba(15, 23, 42, 0.4)" : "rgba(255, 255, 255, 0.6)",
          hover: isLightMode ? "rgba(15, 23, 42, 0.2)" : "rgba(255, 255, 255, 0.35)",
          inherit: "from"
        }
      }))
    );

    const network = new Network(
      containerRef.current,
      { nodes, edges },
      getNetworkOptions(isLightMode)
    );
    networkRef.current = network;

    network.on("click", (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = data.nodes.find((n) => n.id === nodeId);
        if (node) {
          handleNodeClickRef.current(node.label);
        }
      } else {
        setDetail(null);
      }
    });

    network.on("doubleClick", () => {
      network.fit({ animation: true });
    });

    return () => {
      network.destroy();
      networkRef.current = null;
    };
  }, [data, isLightMode]);

  return (
    <div className="graph-visualizer-layout">
      <div className="graph-visualizer-canvas" ref={containerRef} />
      {detailLoading && (
        <div className="graph-detail-loading">
          <IconSpinner size={20} />
        </div>
      )}
      {detail && !detailLoading && (
        <EntityDetailPanel
          detail={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
