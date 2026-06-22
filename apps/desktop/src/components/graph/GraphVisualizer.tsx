import { useEffect, useRef, useState, useCallback } from "react";
import { Network, type Options } from "vis-network";
import { DataSet } from "vis-data";
import { api, GraphEntity, GraphVisualizationData } from "../../lib/api";
import { IconClose, IconSpinner } from "../Icons";

const COMMUNITY_COLORS = [
  "#2dd4bf", "#f59e0b", "#8b5cf6", "#ef4444",
  "#3b82f6", "#ec4899", "#14b8a6", "#f97316",
  "#6366f1", "#84cc16", "#06b6d4", "#d946ef",
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

const NETWORK_OPTIONS: Options = {
  physics: {
    stabilization: { iterations: 100 },
    solver: "forceAtlas2Based",
    forceAtlas2Based: {
      gravitationalConstant: -40,
      centralGravity: 0.005,
      springLength: 160,
      springConstant: 0.02,
      damping: 0.4,
    },
  },
  edges: {
    smooth: { enabled: true, type: "continuous", roundness: 0.5 },
    font: {
      size: 9,
      color: "#737373",
      strokeWidth: 0,
    },
    arrows: { to: { enabled: false } },
    color: { color: "#333", highlight: "#2dd4bf", hover: "#555" },
  },
  nodes: {
    shape: "dot",
    font: {
      size: 11,
      color: "#e5e5e5",
      face: "Inter",
      strokeWidth: 0,
    },
    borderWidth: 1,
    shadow: { enabled: true, size: 4 },
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
          <span className="graph-detail-label">Type</span>
          <span className="graph-detail-value">
            <span className="entity-type">{detail.entity.type || "concept"}</span>
          </span>
        </div>
        <div className="graph-detail-field">
          <span className="graph-detail-label">Rank</span>
          <span className="graph-detail-value">{detail.entity.rank.toFixed(2)}</span>
        </div>
        {detail.entity.description && (
          <div className="graph-detail-field">
            <span className="graph-detail-label">Description</span>
            <p className="graph-detail-desc">{detail.entity.description}</p>
          </div>
        )}
        {detail.entity.community_ids.length > 0 && (
          <div className="graph-detail-field">
            <span className="graph-detail-label">Communities</span>
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
            <span className="graph-detail-label">
              Relationships ({detail.relationships.length})
            </span>
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
      data.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        title: `${n.label} (${n.type}, rank=${n.rank.toFixed(1)})`,
        value: n.rank,
        color: {
          background: getCommunityColor(n.community_id),
          border: "#333",
          highlight: { background: "#2dd4bf", border: "#2dd4bf" },
          hover: { background: "#555", border: "#888" },
        },
        size: Math.max(10, Math.min(40, 10 + n.rank * 3)),
        font: { size: Math.max(9, Math.min(14, 8 + n.rank * 1.5)) },
      }))
    );

    const edges = new DataSet(
      data.edges.map((e, i) => ({
        id: `e${i}`,
        from: data.nodes.find((n) => n.label === e.source)?.id || e.source,
        to: data.nodes.find((n) => n.label === e.target)?.id || e.target,
        label: e.weight >= 0.7 ? e.weight.toFixed(1) : undefined,
        value: e.weight,
        width: Math.max(0.5, e.weight * 3),
        title: e.description ? `${e.description} (w=${e.weight.toFixed(1)})` : `w=${e.weight.toFixed(1)}`,
      }))
    );

    const network = new Network(
      containerRef.current,
      { nodes, edges },
      NETWORK_OPTIONS
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
  }, [data]);

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
