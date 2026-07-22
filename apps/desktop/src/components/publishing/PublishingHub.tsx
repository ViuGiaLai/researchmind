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
  HelpCircle,
  FileCode,
  ExternalLink,
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
  const [selectedTemplate, setSelectedTemplate] = useState<string>("ieee");
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [auditing, setAuditing] = useState(false);
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
      }
    } catch (e) {
      console.error("Failed to fetch publishing templates", e);
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
          title: title || "Manuscript Title",
          content: content || "## Abstract\nSample abstract text...\n\n## Introduction\nIntroduction text...\n",
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
        setContent(fix.snippet + content);
      } else {
        setContent(content + "\n" + fix.snippet);
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

  const filteredChecks = auditResult
    ? auditResult.checks.filter((c) =>
        activeCategoryFilter === "all" ? true : c.category === activeCategoryFilter
      )
    : [];

  return (
    <div className="publishing-hub">
      {/* Header */}
      <div className="publishing-header">
        <div className="publishing-header-copy">
          <h2>
            <FileText className="publishing-header-icon" size={22} />
            {t("publishing.title", "Publishing Engine & Format Auditor Pro")}
          </h2>
          <p>
            {t(
              "publishing.subtitle",
              "Đối chiếu bản thảo với quy chuẩn tạp chí (IEEE, Springer, Nature, ACM, Elsevier, APA) & Tự động Sửa lỗi + Xuất bản."
            )}
          </p>
        </div>
      </div>

      <div className="publishing-grid">
        {/* Left Column: Input Editor & Template Selection */}
        <div className="publishing-card publishing-controls-card">
          <div className="card-section-title">
            <span>{t("publishing.venue_config", "1. Cấu hình Tạp chí & Biên tập Bản thảo")}</span>
          </div>

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
              placeholder={t("publishing.title_placeholder", "Nhập tiêu đề nghiên cứu...")}
            />
          </div>

          <div className="publishing-input-group">
            <div className="label-with-action">
              <label className="publishing-label">
                {t("publishing.content_label", "Nội dung bản thảo (Markdown / Text)")}
              </label>
              <span className="word-count-badge">
                {t("publishing.word_count", {
                  count: content ? content.split(/\s+/).filter(Boolean).length : 0,
                  defaultValue: `${content ? content.split(/\s+/).filter(Boolean).length : 0} từ`,
                })}
              </span>
            </div>
            <textarea
              className="publishing-textarea"
              rows={14}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t(
                "publishing.content_placeholder",
                "Dán toàn bộ bản thảo hoặc tổng quan tài liệu để kiểm tra quy chuẩn..."
              )}
            />
          </div>

          <div className="publishing-actions">
            <button
              type="button"
              className="publishing-btn primary"
              onClick={handleAudit}
              disabled={auditing}
            >
              {auditing ? <IconSpinner size={16} /> : <ShieldCheck size={16} />}
              <span>
                {auditing
                  ? t("publishing.auditing", "Đang phân tích...")
                  : t("publishing.audit_btn", "Quét Quy chuẩn Tạp chí Pro")}
              </span>
            </button>
          </div>
        </div>

        {/* Right Column: Diagnostic Dashboard & Auto Fix */}
        <div className="publishing-card publishing-results-card">
          <div className="card-section-title">
            <span>{t("publishing.audit_dashboard", "2. Bảng chẩn đoán & Tự động Sửa lỗi (Audit Dashboard)")}</span>
          </div>

          {auditResult ? (
            <div className="audit-results-wrapper">
              {/* Overall Score & Counts Banner */}
              <div className="audit-score-banner">
                <div
                  className="audit-score-badge"
                  data-score-tier={
                    auditResult.overall_score >= 85
                      ? "high"
                      : auditResult.overall_score >= 65
                      ? "mid"
                      : "low"
                  }
                >
                  <div className="score-num">{auditResult.overall_score}</div>
                  <div className="score-label">{t("publishing.score_label", "Điểm Quy chuẩn")}</div>
                </div>

                <div className="audit-score-summary">
                  <strong className="venue-title">{auditResult.template.name}</strong>
                  <div className="audit-counts-pills">
                    {auditResult.counts.critical > 0 && (
                      <span className="pill critical">
                        <XCircle size={12} />{" "}
                        {t("publishing.critical_errors", {
                          count: auditResult.counts.critical,
                          defaultValue: `${auditResult.counts.critical} Lỗi nghiêm trọng`,
                        })}
                      </span>
                    )}
                    {auditResult.counts.warning > 0 && (
                      <span className="pill warning">
                        <AlertTriangle size={12} />{" "}
                        {t("publishing.warnings", {
                          count: auditResult.counts.warning,
                          defaultValue: `${auditResult.counts.warning} Cảnh báo`,
                        })}
                      </span>
                    )}
                    {auditResult.counts.suggestion > 0 && (
                      <span className="pill suggestion">
                        <Info size={12} />{" "}
                        {t("publishing.suggestions", {
                          count: auditResult.counts.suggestion,
                          defaultValue: `${auditResult.counts.suggestion} Gợi ý`,
                        })}
                      </span>
                    )}
                    <span className="pill pass">
                      <CheckCircle2 size={12} />{" "}
                      {t("publishing.passed", {
                        count: auditResult.counts.pass,
                        defaultValue: `${auditResult.counts.pass} Đạt`,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Category Sub-Scores Grid */}
              <div className="category-scores-grid">
                {Object.entries(auditResult.category_scores).map(([cat, score]) => (
                  <div
                    key={cat}
                    className={`cat-score-chip ${
                      activeCategoryFilter === cat ? "active" : ""
                    }`}
                    onClick={() =>
                      setActiveCategoryFilter(activeCategoryFilter === cat ? "all" : cat)
                    }
                  >
                    <div className="cat-header">
                      <span className="cat-name">{cat}</span>
                      <span className="cat-val">{score}/100</span>
                    </div>
                    <div className="cat-progress-bar">
                      <div
                        className="cat-progress-fill"
                        style={{
                          width: `${score}%`,
                          background:
                            score >= 85
                              ? "#22c55e"
                              : score >= 65
                              ? "#f59e0b"
                              : "#ef4444",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Checklist Items */}
              <div className="audit-checklist-header">
                <h4>
                  {t("publishing.checklist_title", {
                    count: filteredChecks.length,
                    defaultValue: `Hạng mục đối chiếu (${filteredChecks.length}):`,
                  })}
                </h4>
                {activeCategoryFilter !== "all" && (
                  <button
                    type="button"
                    className="clear-filter-btn"
                    onClick={() => setActiveCategoryFilter("all")}
                  >
                    {t("publishing.show_all", "Hiện tất cả")}
                  </button>
                )}
              </div>

              <div className="audit-checklist">
                {filteredChecks.map((chk, idx) => (
                  <div key={idx} className={`audit-check-item severity-${chk.severity}`}>
                    <div className="check-main-row">
                      <span className={`severity-badge ${chk.severity}`}>
                        {chk.severity === "critical" && <><XCircle size={13} /> Critical</>}
                        {chk.severity === "warning" && <><AlertTriangle size={13} /> Warning</>}
                        {chk.severity === "suggestion" && <><Info size={13} /> Suggestion</>}
                        {chk.severity === "pass" && <><CheckCircle2 size={13} /> Pass</>}
                      </span>

                      <span className="check-title">{chk.name}</span>

                      {chk.location && (
                        <span className="check-location">📍 {chk.location}</span>
                      )}
                    </div>

                    <div className="check-msg">{chk.message}</div>

                    {chk.why && (
                      <div className="check-why">
                        <HelpCircle size={12} className="why-icon" />
                        <span>
                          <strong>{t("publishing.why_label", "Tại sao cần quy chuẩn này?")}</strong> {chk.why}
                          {chk.provenance && (
                            <span className="check-provenance-tag"> (📜 {chk.provenance})</span>
                          )}
                        </span>
                      </div>
                    )}

                    {chk.auto_fix && (
                      <div className="check-autofix-bar">
                        <button
                          type="button"
                          className="autofix-btn"
                          onClick={() => handleAutoFix(chk.auto_fix!)}
                        >
                          <Wand2 size={13} />
                          <span>
                            {t("publishing.autofix_label", {
                              label: chk.auto_fix.label,
                              defaultValue: `Tự động chèn: ${chk.auto_fix.label}`,
                            })}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="publishing-placeholder">
              <ShieldCheck size={42} className="placeholder-icon" />
              <p>
                {t(
                  "publishing.placeholder_text",
                  'Bấm "Quét Quy chuẩn Tạp chí Pro" để nhận điểm số theo từng Hạng mục, vị trí dòng lỗi, lý do tạp chí quy định và nút Auto Fix.'
                )}
              </p>
            </div>
          )}

          {/* Export Center */}
          <div className="publishing-export-box">
            <h4>{t("publishing.exporter_title", "Xuất bản & Đóng gói Báo cáo (Exporter):")}</h4>
            <div className="export-btns">
              <button
                type="button"
                className="export-btn primary"
                onClick={handleExportLatex}
                disabled={exporting === "latex"}
              >
                {exporting === "latex" ? <IconSpinner size={15} /> : <FileCode size={15} />}
                <span>{t("publishing.export_latex", "Gói LaTeX ZIP (.tex + .bib)")}</span>
              </button>

              <button
                type="button"
                className="export-btn"
                onClick={handleExportReport}
                disabled={!auditResult || exporting === "report"}
              >
                {exporting === "report" ? <IconSpinner size={15} /> : <ExternalLink size={15} />}
                <span>{t("publishing.export_report", "Báo cáo Audit Report (PDF/HTML)")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
