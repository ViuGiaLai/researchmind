import { useState } from "react";
import { ExternalSource, api } from "../../lib/api";

interface VerifyPanelProps {
  sources: ExternalSource[];
  status: "full" | "partial" | "local_only";
  onRefresh?: (doi: string) => void;
}

const STATUS_MESSAGES: Record<string, string> = {
  full: "✅ Đã verify qua OpenAlex + Crossref + Semantic Scholar",
  partial: "⚠️ Verify một phần — một số nguồn không phản hồi",
  local_only: "Không đủ bằng chứng học thuật bên ngoài để xác thực claim này.",
};

export function VerifyPanel({ sources, status, onRefresh }: VerifyPanelProps) {
  const [refreshingDoi, setRefreshingDoi] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  if (status === "local_only" || sources.length === 0) {
    return (
      <div
        style={{
          padding: "10px 14px",
          margin: "8px 0",
          borderRadius: 8,
          background: "rgba(148, 163, 184, 0.06)",
          border: "1px solid rgba(148, 163, 184, 0.15)",
          fontSize: "0.82rem",
          color: "var(--color-text-muted, #94a3b8)",
        }}
      >
        <span>📄</span>{" "}
        {STATUS_MESSAGES.local_only}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "10px 14px",
        margin: "8px 0",
        borderRadius: 8,
        background:
          status === "full"
            ? "rgba(16, 185, 129, 0.06)"
            : "rgba(245, 158, 11, 0.06)",
        border: `1px solid ${
          status === "full"
            ? "rgba(16, 185, 129, 0.2)"
            : "rgba(245, 158, 11, 0.2)"
        }`,
        fontSize: "0.82rem",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: 8,
          color:
            status === "full"
              ? "var(--color-success, #10b981)"
              : "var(--color-warning, #f59e0b)",
        }}
      >
        {STATUS_MESSAGES[status]}
      </div>

      {sources.map((src) => (
        <div
          key={src.doi}
          style={{
            padding: "8px 10px",
            margin: "6px 0",
            borderRadius: 6,
            background: "rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{src.title}</div>
          <div
            style={{
              fontSize: "0.78rem",
              color: "var(--color-text-muted, #94a3b8)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <a
              href={`https://doi.org/${src.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-primary, #6366f1)" }}
            >
              doi:{src.doi}
            </a>
            <button
              onClick={async () => {
                setRefreshingDoi(src.doi);
                setRefreshMsg(null);
                try {
                  await api.invalidateAcademicCache(src.doi);
                  setRefreshMsg("Đã xoá cache, hãy gửi lại truy vấn để lấy dữ liệu mới");
                  onRefresh?.(src.doi);
                } catch {
                  setRefreshMsg("Lỗi khi xoá cache");
                } finally {
                  setRefreshingDoi(null);
                }
              }}
              disabled={refreshingDoi === src.doi}
              title="Xoá cache và refresh metadata"
              style={{
                background: "transparent",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: 4,
                color: "var(--color-text-muted, #94a3b8)",
                cursor: "pointer",
                fontSize: "0.7rem",
                padding: "1px 6px",
                opacity: refreshingDoi === src.doi ? 0.5 : 1,
              }}
            >
              {refreshingDoi === src.doi ? "⏳" : "🔄 Refresh"}
            </button>
          </div>
          {refreshMsg && refreshingDoi !== src.doi && (
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--color-success, #10b981)",
                marginBottom: 6,
              }}
            >
              {refreshMsg}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {src.openalex && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  background: "rgba(99, 102, 241, 0.1)",
                  color: "var(--color-primary, #6366f1)",
                }}
              >
                📊 {src.openalex.citation_count.toLocaleString()} citations (OA)
              </span>
            )}
            {src.semantic_scholar && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  background: "rgba(139, 92, 246, 0.1)",
                  color: "#8b5cf6",
                }}
              >
                🎓 {src.semantic_scholar.citation_count} citations (S2)
                {src.semantic_scholar.influential_citation_count > 0 &&
                  ` · ${src.semantic_scholar.influential_citation_count} influential`}
              </span>
            )}
            {src.crossref?.journal && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  background: "rgba(16, 185, 129, 0.1)",
                  color: "var(--color-success, #10b981)",
                }}
              >
                📰 {src.crossref.journal}
              </span>
            )}
            {src.crossref?.year && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  background: "rgba(245, 158, 11, 0.1)",
                  color: "var(--color-warning, #f59e0b)",
                }}
              >
                🗓 {src.crossref.year}
              </span>
            )}
            {src.semantic_scholar?.venue && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  background: "rgba(6, 182, 212, 0.1)",
                  color: "#06b6d4",
                }}
              >
                🏛 {src.semantic_scholar.venue}
              </span>
            )}
          </div>

          {/* Recent citing from OpenAlex */}
          {src.recent_citing.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--color-text-muted, #94a3b8)",
                  marginBottom: 4,
                }}
              >
                Nghiên cứu gần đây (từ 2022) trích dẫn paper này:
              </div>
              {src.recent_citing.slice(0, 3).map((cite, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 6,
                    fontSize: "0.75rem",
                    padding: "2px 0",
                    color: "var(--color-text-muted, #94a3b8)",
                  }}
                >
                  <span style={{ fontWeight: 600, minWidth: 30 }}>
                    {cite.publication_year}
                  </span>
                  <span>{cite.title}</span>
                  {cite.doi && (
                    <a
                      href={`https://doi.org/${cite.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--color-primary, #6366f1)" }}
                    >
                      ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Semantic Scholar citations */}
          {src.s2_citations && src.s2_citations.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--color-text-muted, #94a3b8)",
                  marginBottom: 4,
                }}
              >
                Paper trích dẫn (Semantic Scholar):
              </div>
              {src.s2_citations.slice(0, 3).map((cite, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 6,
                    fontSize: "0.75rem",
                    padding: "2px 0",
                    color: "var(--color-text-muted, #94a3b8)",
                  }}
                >
                  <span>{cite.title}</span>
                  <span style={{ color: "var(--color-primary, #6366f1)" }}>
                    ({cite.citation_count} cit)
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Semantic Scholar recommendations */}
          {src.s2_recommendations && src.s2_recommendations.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--color-text-muted, #94a3b8)",
                  marginBottom: 4,
                }}
              >
                Paper tương tự được đề xuất:
              </div>
              {src.s2_recommendations.slice(0, 2).map((rec, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 6,
                    fontSize: "0.75rem",
                    padding: "2px 0",
                    color: "var(--color-text-muted, #94a3b8)",
                  }}
                >
                  <span>{rec.title}</span>
                  <span style={{ color: "var(--color-primary, #6366f1)" }}>
                    ({rec.citation_count} cit)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
