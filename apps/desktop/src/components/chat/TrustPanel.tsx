import React from "react";
import { IconCheck, IconError, IconSearch, IconDownload, IconBrain } from "../Icons";

interface ClaimAnalysis {
  total_claims: number;
  cited_claims: number;
  uncited_claims: number;
  direct_sources: number;
  indirect_sources: number;
  suspicious_citations: number;
  confidence_score: number;
  uncited_claim_texts: string[];
  suspicious_citation_texts: string[];
}

interface TrustPanelProps {
  analysis: ClaimAnalysis;
  onViewUncited?: () => void;
  onFindMoreSources?: () => void;
  onKeepOnlyCited?: () => void;
  onExport?: () => void;
}

const severityColor = (score: number): { bg: string; color: string; label: string } => {
  if (score >= 80) return { bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", label: "Đáng tin" };
  if (score >= 60) return { bg: "rgba(251, 191, 36, 0.1)", color: "#f59e0b", label: "Trung bình" };
  return { bg: "rgba(239, 68, 68, 0.1)", color: "#ef4444", label: "Thiếu tin cậy" };
};

export const TrustPanel: React.FC<TrustPanelProps> = ({
  analysis,
  onViewUncited,
  onFindMoreSources,
  onKeepOnlyCited,
  onExport,
}) => {
  const severity = severityColor(analysis.confidence_score);

  if (!analysis || analysis.total_claims === 0) return null;

  return (
    <div
      className="trust-panel"
      style={{
        marginTop: "16px",
        borderRadius: "8px",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="trust-panel-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--color-border)",
          background: "rgba(var(--color-primary-rgb), 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <IconBrain size={16} />
          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Báo cáo kiểm chứng</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "3px 10px",
            borderRadius: "12px",
            background: severity.bg,
            color: severity.color,
            fontSize: "0.78rem",
            fontWeight: 600,
          }}
        >
          <span>{analysis.confidence_score}%</span>
          <span style={{ fontWeight: 400, opacity: 0.8 }}>{severity.label}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div
        className="trust-panel-stats"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1px",
          background: "var(--color-border)",
        }}
      >
        {[
          { label: "Tổng nhận định", value: analysis.total_claims, icon: "📊" },
          { label: "Có trích dẫn", value: `${analysis.cited_claims}/${analysis.total_claims}`, icon: "✅", color: "#10b981" },
          { label: "Thiếu nguồn", value: analysis.uncited_claims, icon: "⚠️", color: analysis.uncited_claims > 0 ? "#f59e0b" : undefined },
          { label: "Nguồn trực tiếp", value: analysis.direct_sources, icon: "📄" },
          { label: "Nguồn gián tiếp", value: analysis.indirect_sources, icon: "🔗", color: "#94a3b8" },
          { label: "Trích dẫn nghi ngờ", value: analysis.suspicious_citations, icon: "🔍", color: analysis.suspicious_citations > 0 ? "#ef4444" : undefined },
        ].map((stat, i) => (
          <div
            key={i}
            className="trust-panel-stat"
            style={{
              padding: "8px 12px",
              background: "var(--color-surface)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "0.9rem" }}>{stat.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: stat.color || "var(--color-text)",
                }}
              >
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Uncited claims list */}
      {analysis.uncited_claim_texts.length > 0 && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--color-border)" }}>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#f59e0b",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            ⚠️ Nhận định thiếu nguồn
          </div>
          {analysis.uncited_claim_texts.map((text, i) => (
            <div
              key={i}
              style={{
                padding: "4px 0",
                fontSize: "0.8rem",
                color: "var(--color-text-secondary, #a3a3a3)",
                fontStyle: "italic",
                borderBottom: i < analysis.uncited_claim_texts.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              "{text.length > 120 ? text.slice(0, 120) + "..." : text}"
            </div>
          ))}
        </div>
      )}

      {/* Suspicious citations */}
      {analysis.suspicious_citation_texts.length > 0 && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--color-border)" }}>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#ef4444",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            🔍 Trích dẫn nghi ngờ
          </div>
          {analysis.suspicious_citation_texts.map((text, i) => (
            <div
              key={i}
              style={{
                padding: "4px 0",
                fontSize: "0.8rem",
                color: "var(--color-text-secondary, #a3a3a3)",
                fontStyle: "italic",
              }}
            >
              "{text}"
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div
        className="trust-panel-actions"
        style={{
          display: "flex",
          gap: "6px",
          padding: "8px 14px",
          borderTop: "1px solid var(--color-border)",
          flexWrap: "wrap",
        }}
      >
        {analysis.uncited_claims > 0 && (
          <ActionButton label="Xem nhận định thiếu nguồn" icon={<IconError size={12} />} onClick={onViewUncited} />
        )}
        {analysis.uncited_claims > 0 && (
          <ActionButton label="Tìm thêm nguồn" icon={<IconSearch size={12} />} onClick={onFindMoreSources} />
        )}
        {analysis.uncited_claims > 0 && (
          <ActionButton label="Giữ nhận định có bằng chứng" icon={<IconCheck size={12} />} onClick={onKeepOnlyCited} />
        )}
        <ActionButton label="Xuất báo cáo" icon={<IconDownload size={12} />} onClick={onExport} />
      </div>
    </div>
  );
};

const ActionButton: React.FC<{ label: string; icon: React.ReactNode; onClick?: () => void }> = ({
  label,
  icon,
  onClick,
}) => (
  <button
    onClick={onClick}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 10px",
      borderRadius: "4px",
      border: "1px solid var(--color-border, #333)",
      background: "rgba(255,255,255,0.03)",
      color: "var(--color-text-secondary, #a3a3a3)",
      cursor: onClick ? "pointer" : "default",
      fontSize: "0.75rem",
      fontWeight: 500,
      transition: "all 0.15s",
      whiteSpace: "nowrap",
    }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; }}
  >
    {icon}
    {label}
  </button>
);
