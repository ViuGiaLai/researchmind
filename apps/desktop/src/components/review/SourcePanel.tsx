import { useTranslation } from "react-i18next";
import { IconFileText, IconClose } from "../Icons";

interface Citation {
  paper_id: string;
  paper_title: string;
  citation_text: string;
}

interface EvidenceItem {
  chunk_id: string;
  paper_id: string;
  paper_title: string;
  content: string;
  page_number: number | null;
  score: number;
}

interface SourcePanelProps {
  citations: Citation[];
  evidence: EvidenceItem[];
  onClose: () => void;
  onCitationClick?: (paperId: string, paperTitle: string, page?: number) => void;
}

export function SourcePanel({ citations, evidence, onClose, onCitationClick }: SourcePanelProps) {
  const { t } = useTranslation();
  const papers = new Map<string, { title: string; chunks: EvidenceItem[] }>();
  for (const ev of evidence) {
    if (!papers.has(ev.paper_id)) {
      papers.set(ev.paper_id, { title: ev.paper_title, chunks: [] });
    }
    papers.get(ev.paper_id)!.chunks.push(ev);
  }

  return (
    <div
      style={{
        width: 360,
        flexShrink: 0,
        borderLeft: "1px solid var(--color-border, rgba(148, 163, 184, 0.15))",
        background: "var(--color-surface, rgba(255, 255, 255, 0.01))",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border, rgba(148, 163, 184, 0.1))",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>{t("review_source.sources")}</span>
        <button
          onClick={onClose}
          style={{
            padding: 4,
            borderRadius: 4,
            border: "none",
            background: "transparent",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            display: "flex",
          }}
        >
          <IconClose size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {citations.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {t("review_source.citations")}
            </div>
            {citations.map((c, i) => (
              <div
                key={i}
                onClick={() => onCitationClick?.(c.paper_id, c.paper_title)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  marginBottom: 4,
                  background: "rgba(var(--color-primary-rgb), 0.06)",
                  cursor: onCitationClick ? "pointer" : "default",
                }}
                title={t("review_builder.open_doc")}
              >
                <span style={{ fontWeight: 700, color: "var(--color-primary)" }}>
                  [{i + 1}]
                </span>
                <span style={{ color: "var(--color-text, #e2e8f0)" }}>
                  {c.paper_title}
                </span>
              </div>
            ))}
          </div>
        )}

        {evidence.length > 0 && (
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {t("review_source.evidence_chunks")}
            </div>
            {Array.from(papers.entries()).map(([paperId, paper]) => (
              <div key={paperId} style={{ marginBottom: 12 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: "0.75rem", fontWeight: 600,
                  color: "var(--color-text, #e2e8f0)",
                  marginBottom: 6,
                }}>
                  <IconFileText size={12} />
                  {paper.title}
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 4,
                }}>
                  {paper.chunks.map((ev) => (
                    <div
                      key={ev.chunk_id}
                      onClick={() => onCitationClick?.(ev.paper_id, ev.paper_title, ev.page_number ?? undefined)}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 4,
                        background: "var(--color-bg, rgba(0,0,0,0.03))",
                        fontSize: "0.7rem",
                        lineHeight: 1.5,
                        color: "var(--color-text-muted)",
                        borderLeft: "2px solid var(--color-primary)",
                        display: "flex",
                        flexDirection: "column",
                        cursor: onCitationClick ? "pointer" : "default",
                      }}
                      title={ev.page_number ? t("review_builder.open_doc") + " p." + ev.page_number : t("review_builder.open_doc")}
                    >
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        {ev.content.length > 120 ? ev.content.slice(0, 120) + "..." : ev.content}
                      </div>
                      <div style={{ marginTop: 3, fontSize: "0.6rem", color: "var(--color-text-muted)", display: "flex", gap: 4 }}>
                        <span>Score: {ev.score.toFixed(2)}</span>
                        {ev.page_number ? <span>· p.{ev.page_number}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {citations.length === 0 && evidence.length === 0 && (
          <div style={{
            padding: 20,
            textAlign: "center",
            color: "var(--color-text-muted)",
            fontSize: "0.78rem",
          }}>
            {t("review_source.empty")}
          </div>
        )}
      </div>
    </div>
  );
}
