import { useState } from "react";
import { CheckCircle2, AlertCircle, ExternalLink, RefreshCw, BarChart2, BookOpen, Calendar, HelpCircle as InfoIcon } from "lucide-react";
import { ExternalSource, api } from "../../lib/api";

interface VerifyPanelProps {
  sources: ExternalSource[];
  status: "full" | "partial" | "local_only";
  onRefresh?: (doi: string) => void;
}

const STATUS_MESSAGES: Record<string, string> = {
  full: "Đã xác thực thông tin qua OpenAlex, Crossref & Semantic Scholar",
  partial: "Xác thực một phần — một số nguồn cơ sở dữ liệu không phản hồi",
  local_only: "Không đủ bằng chứng học thuật bên ngoài để đối chiếu claim này.",
};

export function VerifyPanel({ sources, status, onRefresh }: VerifyPanelProps) {
  const [refreshingDoi, setRefreshingDoi] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  if (status === "local_only" || sources.length === 0) {
    return (
      <div
        className="flex items-start gap-3 p-4 my-3 rounded-lg border bg-surface-hover text-text-secondary"
        style={{
          background: "rgba(148, 163, 184, 0.03)",
          borderColor: "rgba(148, 163, 184, 0.15)",
          fontSize: "0.85rem",
        }}
      >
        <InfoIcon size={16} className="text-text-muted mt-0.5 flex-shrink-0" />
        <span className="leading-relaxed">{STATUS_MESSAGES.local_only}</span>
      </div>
    );
  }

  // Styles based on validation level (Vercel/Linear light/dark palette)
  const isFull = status === "full";
  const alertBg = isFull ? "rgba(45, 212, 191, 0.04)" : "rgba(245, 158, 11, 0.04)";
  const alertBorder = isFull ? "rgba(45, 212, 191, 0.2)" : "rgba(245, 158, 11, 0.2)";
  const alertText = isFull ? "var(--color-primary, #2dd4bf)" : "var(--color-warning, #f59e0b)";
  const AlertIcon = isFull ? CheckCircle2 : AlertCircle;

  return (
    <div
      className="p-4 my-4 rounded-xl border flex flex-col gap-3 transition-all duration-300"
      style={{
        background: alertBg,
        borderColor: alertBorder,
        fontSize: "0.85rem",
      }}
    >
      <div className="flex items-center gap-2 font-medium leading-none" style={{ color: alertText }}>
        <AlertIcon size={16} className="flex-shrink-0" />
        <span>{STATUS_MESSAGES[status]}</span>
      </div>

      <div className="flex flex-col gap-3 mt-1">
        {sources.map((src) => (
          <div
            key={src.doi}
            className="p-4 rounded-lg border bg-surface-hover transition-all duration-200"
            style={{
              background: "rgba(0, 0, 0, 0.1)",
              borderColor: "rgba(255, 255, 255, 0.03)",
            }}
          >
            {/* Source Paper Title */}
            <div className="font-semibold text-text leading-snug mb-2" style={{ fontSize: "0.88rem" }}>
              {src.title}
            </div>

            {/* DOI Link & Refresh Actions */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mb-3 text-xs">
              <a
                href={`https://doi.org/${src.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono transition-colors text-primary hover:text-primary-hover"
                style={{ color: "var(--color-primary, #2dd4bf)" }}
              >
                <span>doi:{src.doi}</span>
                <ExternalLink size={10} />
              </a>

              <button
                onClick={async () => {
                  setRefreshingDoi(src.doi);
                  setRefreshMsg(null);
                  try {
                    await api.invalidateAcademicCache(src.doi);
                    setRefreshMsg("Đã xoá cache. Hãy gửi lại câu hỏi để cập nhật.");
                    onRefresh?.(src.doi);
                  } catch {
                    setRefreshMsg("Lỗi khi xoá cache");
                  } finally {
                    setRefreshingDoi(null);
                  }
                }}
                disabled={refreshingDoi === src.doi}
                title="Xoá cache và làm mới metadata"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border text-text-muted hover:text-text hover:bg-surface transition-all disabled:opacity-50"
                style={{
                  background: "transparent",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                <RefreshCw size={11} className={refreshingDoi === src.doi ? "animate-spin" : ""} />
                <span>{refreshingDoi === src.doi ? "Đang xóa..." : "Làm mới"}</span>
              </button>

              {refreshMsg && refreshingDoi !== src.doi && (
                <span className="text-success text-xs font-medium" style={{ color: "var(--color-success, #22c55e)" }}>
                  {refreshMsg}
                </span>
              )}
            </div>

            {/* Citation & Venue Badges */}
            <div className="flex flex-wrap gap-2 mb-3">
              {src.openalex && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border bg-primary/5 text-primary" style={{ background: "rgba(45, 212, 191, 0.05)", borderColor: "rgba(45, 212, 191, 0.15)", color: "var(--color-primary, #2dd4bf)" }}>
                  <BarChart2 size={11} />
                  <span>{src.openalex.citation_count.toLocaleString()} trích dẫn (OA)</span>
                </span>
              )}
              {src.semantic_scholar && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border" style={{ background: "rgba(139, 92, 246, 0.05)", borderColor: "rgba(139, 92, 246, 0.15)", color: "#a78bfa" }}>
                  <BookOpen size={11} />
                  <span>
                    {src.semantic_scholar.citation_count} trích dẫn (S2)
                    {src.semantic_scholar.influential_citation_count > 0 &&
                      ` · ${src.semantic_scholar.influential_citation_count} quan trọng`}
                  </span>
                </span>
              )}
              {src.crossref?.journal && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border" style={{ background: "rgba(16, 185, 129, 0.05)", borderColor: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>
                  <BookOpen size={11} />
                  <span className="truncate max-w-[160px]">{src.crossref.journal}</span>
                </span>
              )}
              {src.crossref?.year && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border" style={{ background: "rgba(245, 158, 11, 0.05)", borderColor: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}>
                  <Calendar size={11} />
                  <span>{src.crossref.year}</span>
                </span>
              )}
            </div>

            {/* Recent citing from OpenAlex */}
            {src.recent_citing.length > 0 && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                <div className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">
                  Nghiên cứu gần đây trích dẫn (từ 2022)
                </div>
                <div className="flex flex-col gap-2">
                  {src.recent_citing.slice(0, 3).map((cite, i) => (
                    <div key={i} className="flex gap-2 text-xs text-text-muted hover:text-text transition-colors">
                      <span className="font-mono text-primary font-medium flex-shrink-0" style={{ color: "var(--color-primary, #2dd4bf)" }}>
                        {cite.publication_year}
                      </span>
                      <span className="flex-1 leading-normal">{cite.title}</span>
                      {cite.doi && (
                        <a
                          href={`https://doi.org/${cite.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-muted hover:text-primary flex-shrink-0 mt-0.5"
                        >
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Semantic Scholar citations */}
            {src.s2_citations && src.s2_citations.length > 0 && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                <div className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">
                  Trích dẫn nổi bật (S2)
                </div>
                <div className="flex flex-col gap-2">
                  {src.s2_citations.slice(0, 3).map((cite, i) => (
                    <div key={i} className="flex gap-2 text-xs text-text-muted">
                      <span className="flex-1 leading-normal">{cite.title}</span>
                      <span className="font-semibold text-primary flex-shrink-0" style={{ color: "var(--color-primary, #2dd4bf)" }}>
                        ({cite.citation_count} trích dẫn)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Semantic Scholar recommendations */}
            {src.s2_recommendations && src.s2_recommendations.length > 0 && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                <div className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">
                  Nghiên cứu tương đồng đề xuất
                </div>
                <div className="flex flex-col gap-2">
                  {src.s2_recommendations.slice(0, 2).map((rec, i) => (
                    <div key={i} className="flex gap-2 text-xs text-text-muted">
                      <span className="flex-1 leading-normal">{rec.title}</span>
                      <span className="font-semibold text-primary flex-shrink-0" style={{ color: "var(--color-primary, #2dd4bf)" }}>
                        ({rec.citation_count} cit)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
