import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Info,
  BarChart2,
  BookOpen,
  Calendar,
  ExternalLink,
  RefreshCw,
  Scale,
  FileText,
  Lightbulb,
  HelpCircle,
} from "lucide-react";
import { ExternalSource, VenueAudit, VerifyReport, api } from "../../lib/api";
import "../../styles/verify.css";

interface VerifyPanelProps {
  sources: ExternalSource[];
  status: "full" | "partial" | "local_only";
  onRefresh?: (doi: string) => void;
  venueAudit?: VenueAudit | null;
  verifyReport?: VerifyReport | null;
}

const VERDICT_ICONS: Record<string, string> = {
  supported: "✅",
  partially_supported: "⚠️",
  inconclusive: "❓",
  contradicted: "❌",
};

export function VerifyPanel({ sources, status, onRefresh, venueAudit, verifyReport }: VerifyPanelProps) {
  const { t } = useTranslation();
  const [refreshingDoi, setRefreshingDoi] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const isEmpty = (status === "local_only" || sources.length === 0) && !venueAudit && !verifyReport;

  if (isEmpty) {
    return (
      <div className="verify-empty">
        <Info size={16} className="flex-shrink-0" />
        <span>{t("verify.local_only")}</span>
      </div>
    );
  }

  const statusClass = `status-${status}`;

  const venueScoreClass =
    venueAudit && venueAudit.overall_score >= 80
      ? "score-high"
      : venueAudit && venueAudit.overall_score >= 60
        ? "score-medium"
        : "score-low";

  return (
    <div className="verify-panel">
      {/* Status Header */}
      <div className={`verify-status-header ${statusClass}`}>
        {status === "full" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
        <span>{t(`verify.${status}`)}</span>
      </div>

      {/* ── ACADEMIC VERDICT ───────────────────────────────────── */}
      {verifyReport?.academic_verdict && (
        <div className="verify-section">
          <div className="verify-section-header">
            <Scale size={14} />
            <span>{t("verify.academic_verdict")}</span>
          </div>
          <div className="verify-section-body">
            <div className={`verify-verdict verdict-${verifyReport.academic_verdict.verdict}`}>
              <span className="verify-verdict-icon">
                {VERDICT_ICONS[verifyReport.academic_verdict.verdict] || "❓"}
              </span>
              <div className="verify-verdict-text">
                <div>{t(`verify.verdicts.${verifyReport.academic_verdict.verdict}`, { defaultValue: t("verify.unknown") })}</div>
                <div className="verify-verdict-reason">{verifyReport.academic_verdict.reason}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ACADEMIC BASIS ─────────────────────────────────────── */}
      {verifyReport?.academic_basis && (
        <div className="verify-section">
          <div className="verify-section-header">
            <FileText size={14} />
            <span>{t("verify.academic_basis")}</span>
          </div>
          <div className="verify-section-body">
            {verifyReport.academic_basis.rules_applied.length > 0 && (
              <div className="verify-basis-line">
                <span className="verify-basis-label">{t("verify.rules_applied")}:</span>{" "}
                {verifyReport.academic_basis.rules_applied.join(", ")}
              </div>
            )}
            {verifyReport.academic_basis.verification_methods.length > 0 && (
              <div className="verify-basis-line">
                <span className="verify-basis-label">{t("verify.methods")}:</span>{" "}
                {verifyReport.academic_basis.verification_methods.join(", ")}
              </div>
            )}
            {verifyReport.academic_basis.standards_used.length > 0 && (
              <div className="verify-basis-line">
                <span className="verify-basis-label">{t("verify.standards")}:</span>{" "}
                {verifyReport.academic_basis.standards_used.join(", ")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EVIDENCE ───────────────────────────────────────────── */}
      {verifyReport?.evidence && verifyReport.evidence.length > 0 && (
        <div className="verify-section">
          <div className="verify-section-header">
            <ShieldCheck size={14} />
            <span>{t("verify.evidence_count", { count: verifyReport.evidence.length })}</span>
          </div>
          <div className="verify-section-body">
            {verifyReport.evidence.map((item, idx) => (
              <div key={idx} className={`verify-evidence-item ${item.status}`}>
                <div className="verify-evidence-icon">
                  {item.status === "pass" && <CheckCircle2 size={14} className="icon-pass" />}
                  {item.status === "fail" && <XCircle size={14} className="icon-critical" />}
                  {item.status === "warning" && <AlertTriangle size={14} className="icon-warning" />}
                </div>
                <div className="verify-evidence-content">
                  <div className="verify-evidence-name">{item.check_name}</div>
                  <div className="verify-evidence-finding">{item.finding}</div>
                  <div className="verify-evidence-meta">
                    <span className="verify-evidence-source">{item.source}</span>
                    <span className={`verify-evidence-confidence ${item.confidence.toLowerCase()}`}>
                      {t(`verify.confidence_levels.${item.confidence.toLowerCase()}`, { defaultValue: item.confidence })}
                    </span>
                    <span className={`verify-evidence-status ${item.status}`}>
                      {t(`verify.evidence_status.${item.status.toLowerCase()}`, { defaultValue: item.status })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LIMITATIONS ────────────────────────────────────────── */}
      {verifyReport?.limitations && (
        <div className="verify-section">
          <div className="verify-section-header">
            <HelpCircle size={14} />
            <span>{t("verify.limitations")}</span>
          </div>
          <div className="verify-section-body">
            {verifyReport.limitations.unverifiable_items.length > 0 && (
              <>
                <div className="verify-limitations-label">
                  {t("verify.unverifiable_items")}:
                </div>
                {verifyReport.limitations.unverifiable_items.map((lim, idx) => (
                  <div key={idx} className="verify-limitation-item">
                    <span className={`impact-${lim.impact}`}>
                      {lim.impact === "high" ? "🔴" : lim.impact === "medium" ? "🟡" : "🟢"}
                    </span>
                    <div>
                      <strong>{lim.item}:</strong> {lim.detail}
                    </div>
                  </div>
                ))}
              </>
            )}
            {verifyReport.limitations.missing_data.map((md, idx) => (
              <div key={`md-${idx}`} className="verify-missing-item">
                <Info size={12} />
                <span>{md}</span>
              </div>
            ))}
            {verifyReport.limitations.assumptions.map((assumption, idx) => (
              <div key={`as-${idx}`} className="verify-missing-item">
                <Info size={12} />
                <span>{t("verify.assumption")}: {assumption}</span>
              </div>
            ))}
            {verifyReport.limitations.unverifiable_items.length === 0 &&
              verifyReport.limitations.missing_data.length === 0 &&
              verifyReport.limitations.assumptions.length === 0 && (
              <div className="verify-limitations-none">
                {t("verify.no_significant_limitations")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONFIDENCE ─────────────────────────────────────────── */}
      {verifyReport?.confidence && (
        <div className="verify-section">
          <div className="verify-section-header">
            <BarChart2 size={14} />
            <span>{t("verify.confidence")}</span>
          </div>
          <div className="verify-section-body">
            <div className="verify-confidence-bar">
              <span className={`verify-confidence-level level-${verifyReport.confidence.level.toLowerCase()}`}>
                {t(`verify.confidence_levels.${verifyReport.confidence.level.toLowerCase()}`, { defaultValue: verifyReport.confidence.level })}
              </span>
              <div
                className="verify-confidence-track"
                role="progressbar"
                aria-label={t("verify.confidence")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(verifyReport.confidence.score * 100)}
              >
                <div
                  className={`verify-confidence-fill fill-${verifyReport.confidence.level.toLowerCase()}`}
                  style={{ width: `${Math.round(verifyReport.confidence.score * 100)}%` }}
                />
              </div>
              <span className="verify-confidence-pct">
                {Math.round(verifyReport.confidence.score * 100)}%
              </span>
            </div>
            {verifyReport.confidence.reasoning && (
              <div className="verify-confidence-reason">{verifyReport.confidence.reasoning}</div>
            )}
          </div>
        </div>
      )}

      {/* ── NEXT STEPS ─────────────────────────────────────────── */}
      {verifyReport?.next_steps && verifyReport.next_steps.length > 0 && (
        <div className="verify-section">
          <div className="verify-section-header">
            <Lightbulb size={14} />
            <span>{t("verify.next_steps")}</span>
          </div>
          <div className="verify-section-body">
            {verifyReport.next_steps.map((step, idx) => (
              <div key={idx} className="verify-next-step">{step}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Venue Compliance (existing) ────────────────────────── */}
      {venueAudit && !verifyReport && (
        <div className="verify-section">
          <div className="verify-section-header">
            <BarChart2 size={14} />
            <span>{t("verify.venue_compliance")}</span>
            {venueAudit.venue_info?.name && (
              <span className="verify-venue-header-name">
                — {venueAudit.venue_info.name}
              </span>
            )}
          </div>
          <div className="verify-section-body">
            <div className="verify-confidence-bar verify-venue-score-area">
              <span className={`verify-venue-score-label ${venueScoreClass}`}>
                {venueAudit.overall_score}%
              </span>
              <div
                className="verify-confidence-track"
                role="progressbar"
                aria-label={t("verify.venue_compliance")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={venueAudit.overall_score}
              >
                <div
                  className={`verify-confidence-fill ${venueAudit.overall_score >= 80 ? "verify-venue-fill-high" : venueAudit.overall_score >= 60 ? "verify-venue-fill-medium" : "verify-venue-fill-low"}`}
                  style={{ width: `${venueAudit.overall_score}%` }}
                />
              </div>
            </div>
            {venueAudit.checks.map((check, idx) => {
              const isPass = check.severity === "pass";
              const isCritical = check.severity === "critical";
              const isWarning = check.severity === "warning";
              return (
                <div key={idx} className={`verify-evidence-item ${check.severity}`}>
                  <div className="verify-evidence-icon">
                    {isPass && <CheckCircle2 size={14} className="icon-pass" />}
                    {isCritical && <XCircle size={14} className="icon-critical" />}
                    {isWarning && <AlertTriangle size={14} className="icon-warning" />}
                  </div>
                  <div className="verify-evidence-content">
                    <div className="verify-evidence-name">{check.name}</div>
                    <div className="verify-evidence-finding">{check.message}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── External Sources (existing) ────────────────────────── */}
      {sources.length > 0 && (
        <div className="verify-sources-list">
          {sources.map((src) => (
            <div key={src.doi} className="verify-section">
              <div className="verify-section-header">
                <BookOpen size={14} />
                <span className="verify-source-title">
                  {src.title}
                </span>
              </div>
              <div className="verify-section-body">
                {/* DOI Link */}
                <div className="verify-source-actions">
                  <a
                    href={`https://doi.org/${src.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="verify-doi-link"
                  >
                    <span>doi:{src.doi}</span>
                    <ExternalLink size={10} />
                  </a>
                  {onRefresh && (
                    <button
                      onClick={async () => {
                        setRefreshingDoi(src.doi);
                        setRefreshMsg(null);
                        try {
                          await api.invalidateAcademicCache(src.doi);
                          setRefreshMsg(t("verify.cache_cleared"));
                          onRefresh?.(src.doi);
                        } catch {
                          setRefreshMsg(t("verify.cache_error"));
                        } finally {
                          setRefreshingDoi(null);
                        }
                      }}
                      disabled={refreshingDoi === src.doi}
                      className="verify-refresh-btn" title={t("verify.refresh_title")} aria-label={t("verify.refresh_title")}
                    >
                      <RefreshCw size={10} className={refreshingDoi === src.doi ? "animate-spin" : ""} />
                      <span>{refreshingDoi === src.doi ? t("verify.refreshing") : t("verify.refresh_btn")}</span>
                    </button>
                  )}
                  {refreshMsg && refreshingDoi !== src.doi && (
                    <span className="verify-evidence-confidence high">{refreshMsg}</span>
                  )}
                </div>

                {/* Badges */}
                <div className="verify-source-badges">
                  {src.openalex && (
                    <span className="verify-evidence-source verify-badge-oa">
                      <BarChart2 size={10} className="verify-badge-icon" />
                      {t("verify.citations_oa", { count: src.openalex.citation_count.toLocaleString() })}
                    </span>
                  )}
                  {src.semantic_scholar && (
                    <span className="verify-evidence-source verify-badge-s2">
                      <BookOpen size={10} className="verify-badge-icon" />
                      {t("verify.citations_s2", { count: src.semantic_scholar.citation_count })}
                      {src.semantic_scholar.influential_citation_count > 0 &&
                        ` · ${t("verify.citations_influential", { count: src.semantic_scholar.influential_citation_count })}`}
                    </span>
                  )}
                  {src.crossref?.journal && (
                    <span className="verify-evidence-source verify-badge-cr">
                      <BookOpen size={10} className="verify-badge-icon" />
                      <span className="verify-citing-title">{src.crossref.journal}</span>
                    </span>
                  )}
                  {src.crossref?.year && (
                    <span className="verify-evidence-source verify-badge-year">
                      <Calendar size={10} className="verify-badge-icon" />
                      {src.crossref.year}
                    </span>
                  )}
                </div>

                {/* Recent citing */}
                {src.recent_citing.length > 0 && (
                  <div className="verify-citing-section">
                    <div className="verify-evidence-name verify-citing-label">
                      {t("verify.recent_citing")}
                    </div>
                    {src.recent_citing.slice(0, 3).map((cite, i) => (
                      <div key={i} className="verify-citing-row">
                        <span className="verify-citing-year">
                          {cite.publication_year}
                        </span>
                        <span className="verify-citing-title">{cite.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* S2 citations */}
                {src.s2_citations && src.s2_citations.length > 0 && (
                  <div className="verify-citing-section">
                    <div className="verify-evidence-name verify-citing-label">
                      {t("verify.s2_citations")}
                    </div>
                    {src.s2_citations.slice(0, 3).map((cite, i) => (
                      <div key={i} className="verify-citing-row">
                        <span className="verify-citing-title">{cite.title}</span>
                        <span className="verify-citing-count">
                          {t("verify.citations_s2_count", { count: cite.citation_count })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* S2 recommendations */}
                {src.s2_recommendations && src.s2_recommendations.length > 0 && (
                  <div className="verify-citing-section">
                    <div className="verify-evidence-name verify-citing-label">
                      {t("verify.s2_recommendations")}
                    </div>
                    {src.s2_recommendations.slice(0, 2).map((rec, i) => (
                      <div key={i} className="verify-citing-row">
                        <span className="verify-citing-title">{rec.title}</span>
                        <span className="verify-citing-count">
                          {t("verify.citations_s2_count", { count: rec.citation_count })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
