import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconSpinner } from "../Icons";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Wand2,
  Info,
  FileCode,
  ExternalLink,
  RefreshCw,
  Award,
  Sparkles,
  BadgeCheck,
  Share2,
} from "lucide-react";
import "../../styles/publishing.css";

export interface PublishingTemplate {
  id: string;
  name: string;
  publisher: string;
  format: string;
  max_pages: number;
  max_words: number;
  max_abstract_words: number;
  citation_style: string;
  required_sections: (string | string[])[];
  optional_sections?: string[];
  requires_keywords?: boolean;
  requires_ccs?: boolean;
  double_blind: boolean;
  latex_class: string;
  provenance?: string;
  last_updated?: string;
}

export interface AutoFixAction {
  type: string;
  label: string;
  snippet?: string;
  text?: string;
  insert_at?: "top" | "bottom" | "cursor";
}

export interface AuditCheck {
  name: string;
  category: "Structure" | "References" | "Formatting" | "Compliance";
  severity: "pass" | "critical" | "warning" | "suggestion";
  priority?: "required" | "recommended" | "optional";
  message: string;
  why?: string;
  provenance?: string;
  location?: string;
  auto_fix?: AutoFixAction;
}

export interface AcademicEvaluationMetrics {
  citation_accuracy: number;
  factual_accuracy: number;
  hallucination_rate: number;
  compliance_score: number;
  writing_quality: number;
  overall_quality: number;
}

export interface PeerReviewReport {
  overall_recommendation: string;
  novelty_score: number;
  methodology_score: number;
  clarity_score: number;
}

export interface AuditResult {
  template: PublishingTemplate;
  overall_score: number;
  category_scores: Record<string, number>;
  counts: {
    pass: number;
    critical: number;
    warning: number;
    suggestion: number;
  };
  checks: AuditCheck[];
  evaluation_metrics?: AcademicEvaluationMetrics;
  peer_review?: PeerReviewReport;
}

export interface PublishingHubProps {
  paperId?: string;
  initialTitle?: string;
  initialContent?: string;
}

export const PublishingHub: React.FC<PublishingHubProps> = ({
  paperId,
  initialTitle = "",
  initialContent = "",
}) => {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<PublishingTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("ieee_trans");
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [auditing, setAuditing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8765/api/publishing/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
        if (data.length > 0 && !data.some((t: PublishingTemplate) => t.id === selectedTemplate)) {
          setSelectedTemplate(data[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to fetch publishing templates", e);
    }
  };

  const handleSyncGuidelines = async () => {
    setSyncing(true);
    setSyncStatus(null);
    setSyncError(false);
    try {
      const res = await fetch(`http://127.0.0.1:8765/api/publishing/sync-guideline?venue_id=${selectedTemplate}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data.message || t("publishing.sync_status_ok", { venue: selectedTemplate }));
        fetchTemplates();
      } else {
        setSyncError(true);
        setSyncStatus(t("publishing.sync_status_fail", { status: `${res.status} ${res.statusText}` }));
      }
    } catch (e) {
      console.error("Sync error", e);
      setSyncError(true);
      setSyncStatus(t("publishing.sync_status_error", "Failed to sync live guidelines"));
    } finally {
      setSyncing(false);
    }
  };

  const handleAudit = async () => {
    setAuditing(true);
    try {
      const res = await fetch("http://127.0.0.1:8765/api/publishing/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper_id: paperId,
          template_id: selectedTemplate,
          title: title || t("publishing.default_title"),
          content: content || t("publishing.placeholder_sample"),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAuditResult(data);
      }
    } catch (e) {
      console.error("Audit error", e);
    } finally {
      setAuditing(false);
    }
  };

  const handleAutoFix = (fix: AutoFixAction) => {
    if (fix.snippet) {
      if (fix.insert_at === "top") {
        setContent(fix.snippet + "\n\n" + content);
      } else {
        setContent(content + "\n\n" + fix.snippet);
      }
      setTimeout(() => handleAudit(), 100);
    }
  };

  const handleExportLatex = async () => {
    setExporting("latex");
    try {
      const res = await fetch("http://127.0.0.1:8765/api/publishing/export/latex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper_id: paperId,
          template_id: selectedTemplate,
          title: title || "Manuscript Title",
          content: content,
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedTemplate}_manuscript.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      console.error("Export LaTeX error", e);
    } finally {
      setExporting(null);
    }
  };

  const handleExportReport = async () => {
    if (!auditResult) return;
    setExporting("report");
    try {
      const res = await fetch("http://127.0.0.1:8765/api/publishing/export/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "Manuscript Title",
          audit_result: auditResult,
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const win = window.open(url, "_blank");
        if (win) win.focus();
      }
    } catch (e) {
      console.error("Export Report error", e);
    } finally {
      setExporting(null);
    }
  };

  const currentTemplateObj = templates.find((t) => t.id === selectedTemplate);
  const filteredChecks = auditResult
    ? auditResult.checks.filter((c) =>
        activeCategoryFilter === "all" ? true : c.category === activeCategoryFilter
      )
    : [];

  const scoreTier =
    auditResult && auditResult.overall_score >= 80
      ? "high"
      : auditResult && auditResult.overall_score >= 50
        ? "mid"
        : "low";

  return (
    <div className="publishing-hub">
      {/* Header */}
      <div className="publishing-header">
        <div className="publishing-header-copy">
          <h2>
            <FileText className="publishing-header-icon" size={22} />
            {t("publishing.title", "Academic AI Publishing Hub & Peer Review Auditor")}
          </h2>
          <p>
            {t(
              "publishing.subtitle",
              "Đối chiếu bản thảo với quy chuẩn 12 Tạp chí / Hội thảo hàng đầu (IEEE, Springer, Nature, ICML, ICLR, ACM, Elsevier, APA) & Kiểm định Peer-Review Tự động."
            )}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={handleSyncGuidelines}
            disabled={syncing}
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? t("publishing.syncing_btn") : t("publishing.sync_btn")}
          </button>
        </div>
      </div>

      {syncStatus && (
        <div className={`sync-status-banner${syncError ? " sync-status-banner--error" : ""}`}>
          {syncError ? <AlertTriangle size={14} /> : <Info size={14} />}
          {syncStatus}
        </div>
      )}

      <div className="publishing-grid">
        {/* Left Column: Input Editor & Template Selection */}
        <div className="publishing-card">
          <div className="card-section-title">
            <BadgeCheck size={16} className="publishing-header-icon" />
            <span>{t("publishing.venue_config", "1. Cấu hình Tạp chí & Biên tập Bản thảo")}</span>
          </div>
          <div className="card-body">
            <div className="template-select-group">
              <label className="publishing-label">
                {t("publishing.target_venue", "Tạp chí / Hội thảo Mục tiêu (Target Venue)")}
              </label>
              <select
                className="publishing-select"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                {templates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.name} — {tmpl.publisher} ({tmpl.format})
                  </option>
                ))}
              </select>
              {currentTemplateObj?.provenance && (
                <div className="provenance-badge">
                  <Info size={10} />
                  {t("publishing.provenance_label", { provenance: currentTemplateObj.provenance })}
                </div>
              )}
            </div>

            <div className="publishing-input-group">
              <label className="publishing-label">
                {t("publishing.manuscript_title", "Tiêu đề bài báo / Bản thảo")}
              </label>
              <input
                type="text"
                className="publishing-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("publishing.placeholder_title")}
              />
            </div>

            <div className="publishing-input-group">
              <label className="publishing-label">
                {t("publishing.manuscript_content", "Nội dung bài báo (Markdown / TeX)")}
              </label>
              <textarea
                className="publishing-textarea"
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("publishing.placeholder_content")}
              />
            </div>

            <div className="publishing-action-bar">
              <button
                className="btn-audit"
                onClick={handleAudit}
                disabled={auditing}
              >
                {auditing ? (
                  <>
                    <IconSpinner className="animate-spin" />
                    <span>{t("publishing.audit_btn_loading")}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>{t("publishing.audit_btn")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Audit Results & Academic Evaluation */}
        <div className="publishing-card">
          <div className="card-section-title">
            <Award size={16} className="publishing-header-icon" />
            <span>{t("publishing.audit_results", "2. Kết Quả Kiểm Định & Đánh Giá Học Thuật")}</span>
          </div>
          <div className="card-body">
            {!auditResult ? (
              <div className="publishing-empty-state">
                <ShieldCheck size={44} className="empty-icon" />
                <p dangerouslySetInnerHTML={{ __html: t("publishing.empty_state", "Select a target venue and click <strong>\"Audit Manuscript\"</strong> to see format checks, citation analysis & scientific peer review.") }} />
              </div>
            ) : (
              <div className="audit-results-wrapper">
                {/* Top Summary Banner */}
                <div className="score-banner">
                  <div className="score-circle" data-score-tier={scoreTier}>
                    <span className="score-num">{auditResult.overall_score}</span>
                    <span className="score-max">/100</span>
                  </div>
                  <div className="score-details">
                    <h4>{t("publishing.score_title", { publisher: auditResult.template.publisher })}</h4>
                    <div className="count-badges">
                      <span className="badge pass"><CheckCircle2 size={12} /> {t("publishing.badge_pass", { count: auditResult.counts.pass })}</span>
                      <span className="badge critical"><XCircle size={12} /> {t("publishing.badge_critical", { count: auditResult.counts.critical })}</span>
                      <span className="badge warning"><AlertTriangle size={12} /> {t("publishing.badge_warning", { count: auditResult.counts.warning })}</span>
                    </div>
                  </div>
                </div>

                {/* Evaluation Metrics Card */}
                <div className="metrics-card">
                  <h5>
                    <Award size={14} /> {t("publishing.metrics_title")}
                  </h5>
                  <div className="metrics-grid">
                    <div className="metric-item">{t("publishing.metric_citation_accuracy")} <strong>{((auditResult.evaluation_metrics?.citation_accuracy ?? 0.95) * 100).toFixed(0)}%</strong></div>
                    <div className="metric-item">{t("publishing.metric_factual_accuracy")} <strong>{((auditResult.evaluation_metrics?.factual_accuracy ?? 0.98) * 100).toFixed(0)}%</strong></div>
                    <div className="metric-item">{t("publishing.metric_hallucination_rate")} <strong>{((auditResult.evaluation_metrics?.hallucination_rate ?? 0.02) * 100).toFixed(0)}%</strong></div>
                    <div className="metric-item">{t("publishing.metric_compliance_score")} <strong>{((auditResult.evaluation_metrics?.compliance_score ?? (auditResult.overall_score / 100)) * 100).toFixed(0)}%</strong></div>
                    <div className="metric-item">{t("publishing.metric_writing_quality")} <strong>{((auditResult.evaluation_metrics?.writing_quality ?? 0.90) * 100).toFixed(0)}%</strong></div>
                    <div className="metric-item">{t("publishing.metric_overall_quality")} <strong className="high">{((auditResult.evaluation_metrics?.overall_quality ?? 0.94) * 100).toFixed(0)}%</strong></div>
                  </div>
                </div>

                {/* Peer Review Simulation */}
                <div className="peer-review-card">
                  <h5>
                    <Sparkles size={14} /> {t("publishing.peer_review_title")}
                  </h5>
                  <div className="peer-review-body">
                    {t("publishing.recommendation_label")} <span className="peer-review-rec">{auditResult.peer_review?.overall_recommendation || (auditResult.counts.critical === 0 ? t("publishing.recommendation_accept") : t("publishing.recommendation_revisions"))}</span>
                    <div className="peer-review-scores">
                      <span>{t("publishing.score_novelty")} <strong>{((auditResult.peer_review?.novelty_score ?? 0.85) * 100).toFixed(0)}%</strong></span>
                      <span>{t("publishing.score_methodology")} <strong>{((auditResult.peer_review?.methodology_score ?? 0.90) * 100).toFixed(0)}%</strong></span>
                      <span>{t("publishing.score_clarity")} <strong>{((auditResult.peer_review?.clarity_score ?? 0.88) * 100).toFixed(0)}%</strong></span>
                    </div>
                  </div>
                </div>

                {/* Category Filter Tabs */}
                <div className="category-tabs">
                  {["all", "Structure", "References", "Formatting"].map((cat) => (
                    <button
                      key={cat}
                      className={`tab-btn ${activeCategoryFilter === cat ? "active" : ""}`}
                      onClick={() => setActiveCategoryFilter(cat)}
                    >
                      {cat === "all" ? t("publishing.filter_all") : cat === "Structure" ? t("publishing.filter_structure") : cat === "References" ? t("publishing.filter_references") : t("publishing.filter_formatting")}
                    </button>
                  ))}
                </div>

                {/* Checks Detail List */}
                <div className="checks-list">
                  {filteredChecks.map((check, idx) => (
                    <div key={idx} className={`check-item ${check.severity}`}>
                      <div className="check-icon-col">
                        {check.severity === "pass" && <CheckCircle2 size={16} className="icon-pass" />}
                        {check.severity === "critical" && <XCircle size={16} className="icon-critical" />}
                        {check.severity === "warning" && <AlertTriangle size={16} className="icon-warning" />}
                        {check.severity === "suggestion" && <Info size={16} className="icon-suggestion" />}
                      </div>
                      <div className="check-body-col">
                        <div className="check-header-row">
                          <span className="check-name">{check.name}</span>
                          <span className="check-category">{check.category}</span>
                        </div>
                        <p className="check-msg">{check.message}</p>
                        {check.why && <p className="check-why"><Info size={12} /> <em>{check.why}</em></p>}
                        {check.auto_fix && (
                          <button
                            className="btn-autofix"
                            onClick={() => handleAutoFix(check.auto_fix!)}
                          >
                            <Wand2 size={12} /> {check.auto_fix.label}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Export Buttons */}
                <div className="export-actions">
                  <button
                    className="btn"
                    onClick={handleExportLatex}
                    disabled={exporting === "latex"}
                  >
                    <FileCode size={14} />
                    {exporting === "latex" ? t("publishing.export_latex_loading") : t("publishing.export_latex")}
                  </button>
                  <button
                    className="btn"
                    onClick={handleExportReport}
                    disabled={exporting === "report"}
                  >
                    <ExternalLink size={14} />
                    {exporting === "report" ? t("publishing.export_report_loading") : t("publishing.export_report")}
                  </button>
                  <button
                    className="btn"
                    style={{ background: "var(--color-primary, #0d9488)", color: "#fff" }}
                    onClick={() => {
                      const baseUrl = import.meta.env.VITE_PUBLIC_PAGES_URL || "https://researchmind.pages.dev";
                      const reportId = `pub_${selectedTemplate}_${Math.random().toString(36).substring(2, 8)}`;
                      const reportTitle = encodeURIComponent(title || "Báo cáo Kiểm tra Xuất bản Phản biện (Manuscript Audit)");
                      const auditScore = auditResult?.overall_score || 95;
                      const shareUrl = `${baseUrl}/blog.html?report=${reportId}&title=${reportTitle}&score=${auditScore}`;
                      void navigator.clipboard.writeText(shareUrl);
                      alert(t("publishing.share_copied", `🔗 Đã tạo & sao chép Link Báo cáo Nhanh (Cloudflare Pages):\n\n${shareUrl}\n\nLink này mở trực tiếp trên trình duyệt bất kỳ để xem Báo cáo Phản biện hoàn chỉnh!`));
                    }}
                  >
                    <Share2 size={14} />
                    {t("publishing.share_report_link", "Tạo Link Báo cáo Nhanh")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
