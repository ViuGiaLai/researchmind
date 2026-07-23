import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { IconRefresh, IconSpinner, IconCheck, IconFileText, IconError } from "../Icons";

interface QualityIssue {
  severity: "high" | "medium" | "low";
  section: string;
  type: string;
  message: string;
  action: string;
  action_label: string;
}

interface Citation {
  paper_id: string;
  paper_title: string;
  citation_text: string;
}

interface SectionCardProps {
  section: string;
  title: string;
  description?: string;
  subheadings?: string[];
  content?: string;
  loading?: boolean;
  isStreaming?: boolean;
  evidenceCount?: number;
  paperCount?: number;
  status: "pending" | "generating" | "done" | "empty";
  issues?: QualityIssue[];
  citations?: Citation[];
  onGenerate: (section: string) => void;
  onEdit?: (section: string) => void;
  allowPendingEdit?: boolean;
  onIssueAction?: (section: string, action: string, type: string) => void;
  onCitationClick?: (paperId: string, paperTitle: string, page?: number) => void;
}

const sectionCardStyles = `
.section-card-citation {
  display: inline-flex;
  align-items: center;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(var(--color-primary-rgb), 0.1);
  color: var(--color-primary);
  font-size: 0.75em;
  font-weight: 600;
  margin: 0 1px;
  border: 1px solid rgba(var(--color-primary-rgb), 0.2);
}
`;

function renderContentWithCitations(
  text: string,
  citations?: Citation[],
  onCitationClick?: (paperId: string, paperTitle: string, page?: number) => void
) {
  const lines = text.split("\n");
  return lines.map((line, li) => {
    const parts = line.split(/(\[[^\]]+\])/g);
    const children = parts.map((part, pi) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (m) {
        const num = parseInt(m[1], 10);
        const citation = citations?.[num - 1];
        if (!citation) return <Fragment key={pi}>{part}</Fragment>;
        return (
          <span
            key={pi}
            className="section-card-citation"
            onClick={(e) => {
              e.stopPropagation();
              onCitationClick?.(citation.paper_id, citation.paper_title);
            }}
            style={{ cursor: "pointer" }}
            title={i18n.t("review_builder.open_citation", { label: citation.paper_title })}
          >
            [{num}]
          </span>
        );
      }
      const long = part.match(/^\[([a-f0-9\-]+)_([^\]]*?)(?:,\s*trang\s*(\d+))?\]$/i);
      if (long) {
        const paperId = long[1];
        const page = long[3] ? parseInt(long[3], 10) : undefined;
        const citation = citations?.find((c) => c.paper_id === paperId);
        const label = citation?.paper_title || paperId;
        return (
          <span
            key={pi}
            className="section-card-citation"
            onClick={(e) => {
              e.stopPropagation();
              onCitationClick?.(paperId, label, page);
            }}
            style={{ cursor: "pointer" }}
            title={i18n.t("review_builder.open_citation_page", { label, page: page || "" })}
          >
            {page ? "[" + page + "]" : "[" + label.slice(0, 20) + "...]"}
          </span>
        );
      }
      return <Fragment key={pi}>{part}</Fragment>;
    });
    return (
      <Fragment key={li}>
        {children}
        {li < lines.length - 1 && <br />}
      </Fragment>
    );
  });
}

export function SectionCard({
  section,
  title,
  description,
  subheadings,
  content,
  loading,
  isStreaming,
  evidenceCount,
  paperCount,
  status,
  issues,
  citations,
  onGenerate,
  onEdit,
  allowPendingEdit = false,
  onIssueAction,
  onCitationClick,
}: SectionCardProps) {
  const { t } = useTranslation();

  return (
    <>
      <style>{sectionCardStyles}</style>
    <div
      style={{
        border: "1px solid var(--color-border, rgba(148, 163, 184, 0.15))",
        borderRadius: 10,
        marginBottom: 12,
        background: "var(--color-surface, rgba(255, 255, 255, 0.02))",
        overflow: "hidden",
        transition: "all 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          minWidth: 0,
          borderBottom: status === "done" ? "1px solid var(--color-border, rgba(148, 163, 184, 0.1))" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, overflow: "hidden" }}>
          {status === "done" ? (
            <IconCheck size={16} style={{ color: "var(--color-success, #22c55e)" }} />
          ) : status === "generating" ? (
            <IconSpinner size={16} style={{ color: "var(--color-primary)" }} />
          ) : (
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              border: "2px solid var(--color-border, rgba(148, 163, 184, 0.3))",
            }} />
          )}
          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{title}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {evidenceCount !== undefined && (
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 4,
              background: "rgba(var(--color-primary-rgb), 0.08)",
              color: "var(--color-primary)",
              fontSize: "0.72rem", fontWeight: 500,
            }}>
              <IconFileText size={11} />
              {evidenceCount} chunks
              {paperCount ? " . " + paperCount + " papers" : ""}
            </div>
          )}
          {issues && issues.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {issues.some((i) => i.severity === "high") ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 3,
                  padding: "2px 7px", borderRadius: 4,
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#ef4444", fontSize: "0.68rem", fontWeight: 600,
                }}>
                  <IconError size={10} />
                  {issues.length}
                </div>
              ) : issues.some((i) => i.severity === "medium") ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 3,
                  padding: "2px 7px", borderRadius: 4,
                  background: "rgba(245, 158, 11, 0.1)",
                  color: "#f59e0b", fontSize: "0.68rem", fontWeight: 600,
                }}>
                  {issues.length}
                </div>
              ) : (
                <div style={{
                  display: "flex", alignItems: "center", gap: 3,
                  padding: "2px 7px", borderRadius: 4,
                  background: "rgba(148, 163, 184, 0.1)",
                  color: "var(--color-text-muted)",
                  fontSize: "0.68rem", fontWeight: 600,
                }}>
                  {issues.length}
                </div>
              )}
            </div>
          )}
          {(status === "done" || allowPendingEdit) && onEdit ? (
            <button
              onClick={() => onEdit?.(section)}
              style={{
                padding: "4px 10px", borderRadius: 4,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "transparent",
                color: "var(--color-text-muted)",
                cursor: "pointer", fontSize: "0.75rem",
              }}
            >
              {t("review_builder.edit")}
            </button>
          ) : null}
          <button
            onClick={() => onGenerate(section)}
            disabled={loading}
            style={{
              padding: "4px 12px", borderRadius: 4,
              border: "1px solid var(--color-primary)",
              background: loading ? "rgba(var(--color-primary-rgb), 0.08)" : "rgba(var(--color-primary-rgb), 0.08)",
              color: "var(--color-primary)",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "0.75rem", fontWeight: 500,
              opacity: loading ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {loading ? (
              <IconSpinner size={12} />
            ) : (
              <IconRefresh size={12} />
            )}
            {loading ? t("review_builder.editor_generating") : status === "done" ? t("review_builder.regenerate") : t("wow.generate")}
          </button>
        </div>
      </div>
      {/* Content area: streaming cursor, skeleton, or full content */}
      {isStreaming && content ? (
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: "0.82rem", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            {content}
            <span className="rv-stream-cursor" />
          </div>
        </div>
      ) : loading && !content ? (
        <div style={{ padding: "12px 16px" }}>
          <div className="rv-skeleton-lines">
            <div className="rv-skeleton-line" style={{ width: "92%" }} />
            <div className="rv-skeleton-line" style={{ width: "78%" }} />
            <div className="rv-skeleton-line" style={{ width: "85%" }} />
            <div className="rv-skeleton-line" style={{ width: "65%" }} />
          </div>
        </div>
      ) : status === "done" && content ? (
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: "0.82rem", lineHeight: 1.7, color: "var(--color-text, #e2e8f0)" }}>
            {renderContentWithCitations(content, citations, onCitationClick)}
          </div>
          {issues && issues.length > 0 && (
            <div style={{
              marginTop: 8, paddingTop: 8,
              borderTop: "1px solid var(--color-border, rgba(148, 163, 184, 0.08))",
            }}>
              {issues.map((iss, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 6,
                    padding: "4px 8px", borderRadius: 4, marginBottom: 3,
                    fontSize: "0.72rem", lineHeight: 1.4,
                    background: iss.severity === "high"
                      ? "rgba(239, 68, 68, 0.06)"
                      : iss.severity === "medium"
                      ? "rgba(245, 158, 11, 0.06)"
                      : "rgba(148, 163, 184, 0.06)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontWeight: 700, flexShrink: 0,
                      color: iss.severity === "high" ? "#ef4444" : iss.severity === "medium" ? "#f59e0b" : "var(--color-text-muted)",
                    }}>
                      {iss.severity === "high" ? "!" : iss.severity === "medium" ? "?" : "."}
                    </span>
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {iss.message}
                    </span>
                  </div>
                  {iss.action && iss.action !== "none" && (
                    <button
                      onClick={() => onIssueAction?.(section, iss.action, iss.type)}
                      style={{
                        padding: "2px 8px", borderRadius: 3,
                        border: "1px solid var(--color-primary)",
                        background: "rgba(var(--color-primary-rgb), 0.06)",
                        color: "var(--color-primary)",
                        cursor: "pointer", fontSize: "0.65rem", fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      {iss.action_label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : status === "generating" ? (
        <div style={{
          padding: "20px", textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "0.82rem",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <IconSpinner size={14} />
          <span>{t("review_builder.editor_generating")}</span>
        </div>
      ) : description || (subheadings && subheadings.length > 0) ? (
        <div style={{ padding: "12px 16px" }}>
          {description && (
            <div style={{
              fontSize: "0.78rem",
              color: "var(--color-text-muted)",
              lineHeight: 1.55,
            }}>
              {description}
            </div>
          )}
          {subheadings && subheadings.length > 0 && (
            <ul style={{
              margin: "10px 0 0", paddingLeft: 20,
              color: "var(--color-text)", fontSize: "0.78rem", lineHeight: 1.65,
            }}>
              {subheadings.map((item, index) => <li key={`${section}-detail-${index}`}>{item}</li>)}
            </ul>
          )}
        </div>
      ) : null}
    </div>
    </>
  );
}
