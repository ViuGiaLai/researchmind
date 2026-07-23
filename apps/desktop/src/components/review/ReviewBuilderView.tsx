import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, ReviewSection, ReviewSectionResponse, OutlineSection, EvidencePreflightResponse, EvidenceItem, ReviewDraftSummary, DraftVersionSummary, QualityIssue, QualityMetrics, getAuthenticatedApiUrl } from "../../lib/api";
import { paperDisplayTitle } from "../../lib/paperDisplay";
import { SectionCard } from "./SectionCard";
import { ReviewSectionEditor } from "./ReviewSectionEditor";
import { ProgressSidebar } from "./ProgressSidebar";
import { SourcePanel } from "./SourcePanel";
import { useToast } from "../shared/Toast";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useConfirmDialog, usePromptDialog } from "../shared/ConfirmDialog";
import {
  IconBookOpen,
  IconFileText,
  IconCheck,
  IconChart,
  IconDownload,
  IconError,
  IconSpinner,
  IconRefresh,
  IconClose,
  IconTrash,
  IconClock,
  IconZap,
  IconSearch,
  IconEdit,
} from "../Icons";

function getDefaultSections(t: (key: string) => string): OutlineSection[] {
  const keys = [
    "review_scope", "conceptual_background", "study_characteristics",
    "methodology_comparison", "comparative_synthesis", "limitations",
    "research_gaps", "conclusion", "bibliography",
  ];
  return keys.map((key, index) => ({
    key,
    title: `${index + 1}. ${t(`review_builder.framework_${key}`)}`,
    description: t(`review_builder.framework_${key}_desc`),
    subheadings: [],
  }));
}

type Step = "select" | "outline" | "review";

interface ReviewBuilderViewProps {
  projectId?: string;
  initialPaperIds?: string[];
}

export function ReviewBuilderView({ projectId, initialPaperIds = [] }: ReviewBuilderViewProps) {
  const { t } = useTranslation();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const { prompt, promptDialog } = usePromptDialog();
  const [papers, setPapers] = useState<{ id: string; title: string; authors: string; thumbnail_url?: string; auto_summary?: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState(t("review_builder.default_title"));
  const [step, setStep] = useState<Step>("select");
  const [sections, setSections] = useState<Record<string, ReviewSection>>({});
  const [outlineSections, setOutlineSections] = useState<OutlineSection[]>(getDefaultSections(t));
  const [fullText, setFullText] = useState("");
  const [paperTitles, setPaperTitles] = useState<string[]>([]);
  const [generatingSections, setGeneratingSections] = useState<Set<string>>(new Set());
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightReport, setPreflightReport] = useState<EvidencePreflightResponse | null>(null);
  const [streamingContent, setStreamingContent] = useState<Record<string, string>>({});
  const sectionStreamRef = useRef<{ abort: () => void } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, EvidenceItem[]>>({});
  const [, setEvidenceLoading] = useState<Set<string>>(new Set());
  const [showSource, setShowSource] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeSection, setActiveSection] = useState<string | undefined>();
  const [editingSection, setEditingSection] = useState<string | undefined>();
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [activePdf, setActivePdf] = useState<{ paperId: string; paperTitle: string; page?: number } | null>(null);
  const pdfDialogRef = useDialogFocus<HTMLDivElement>(Boolean(activePdf), () => setActivePdf(null));
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const toast = useToast();

  // ─── Save/Load ─────────────────────────────────────────────
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<ReviewDraftSummary[]>([]);
  const [, setDraftsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const getDraftPayload = useCallback(() => ({
    id: currentDraftId || undefined,
    title,
    paper_ids: selectedIds,
    paper_titles: paperTitles,
    outline_sections: outlineSections,
    sections,
    full_text: fullText || rebuildFullText(title, sections, outlineSections),
  }), [currentDraftId, title, selectedIds, paperTitles, outlineSections, sections, fullText]);

  const doSave = useCallback(async (createVersion = false): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = { ...getDraftPayload(), create_version: createVersion };
      const res = await api.saveReviewDraft(payload);
      if (res.id && !res.error) {
        setCurrentDraftId(res.id);
        setLastSaved(new Date());
        if (createVersion && currentDraftId) loadVersions(currentDraftId);
        return true;
      } else if (res.error) {
        throw new Error(res.error);
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("review_builder.error_save_draft");
      setSaveError(msg);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      toast.addToast("error", t("review_builder.toast_save_failed", { msg }));
      if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
      saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 5000);
      return false;
    } finally {
      setSaving(false);
    }
  }, [getDraftPayload, toast]);

  // Auto-save: debounce 3s after any content change
  useEffect(() => {
    if (step !== "review") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { doSave(); }, 3000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sections, title, fullText, step, doSave]);

  const handleManualSave = async () => {
    const ok = await doSave(true);
    if (ok) toast.addToast("success", t("review_builder.toast_saved"));
  };

  // ─── Version History ───────────────────────────────────────
  const [versions, setVersions] = useState<DraftVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const loadVersions = useCallback(async (draftId: string) => {
    if (!draftId) return;
    setVersionsLoading(true);
    try {
      const res = await api.listDraftVersions(draftId);
      setVersions(res.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  const handleRestoreVersion = async (versionIdx: number) => {
    if (!currentDraftId) return;
    if (!(await confirm(t("review_builder.confirm_restore_version")))) return;
    try {
      const res = await api.restoreDraftVersion(currentDraftId, versionIdx);
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
      // Reload the draft after restore
      const data = await api.loadReviewDraft(currentDraftId);
      if (data.error) {
        toast.addToast("error", data.error);
        return;
      }
      setTitle(data.title);
      setSelectedIds(data.paper_ids || []);
      setPaperTitles(data.paper_titles || []);
      setOutlineSections(data.outline_sections || getDefaultSections(t));
      setSections(data.sections || {});
      setFullText(data.full_text || "");
      setShowVersions(false);
      loadVersions(currentDraftId);
      toast.addToast("success", t("review_builder.toast_restored"));
    } catch (e) {
      toast.addToast("error", t("review_builder.toast_restore_failed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  const loadDrafts = async () => {
    setDraftsLoading(true);
    try {
      const res = await api.listReviewDrafts();
      setSavedDrafts(res.drafts || []);
    } catch {
      // silent
    } finally {
      setDraftsLoading(false);
    }
  };

  const handleLoadDraft = async (draftId: string) => {
    try {
      const data = await api.loadReviewDraft(draftId);
      if (data.error) {
        toast.addToast("error", data.error);
        return;
      }
      setCurrentDraftId(data.id);
      setTitle(data.title);
      setSelectedIds(data.paper_ids || []);
      setPaperTitles(data.paper_titles || []);
      setOutlineSections(data.outline_sections || getDefaultSections(t));
      setSections(data.sections || {});
      setFullText(data.full_text || "");
      setStep("review");
      setShowVersions(false);
      loadVersions(draftId);
      toast.addToast("success", t("review_builder.toast_draft_loaded", { title: data.title }));
    } catch (e) {
      toast.addToast("error", t("review_builder.toast_load_failed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      const res = await api.deleteReviewDraft(draftId);
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
      setSavedDrafts((prev) => prev.filter((d) => d.id !== draftId));
      if (currentDraftId === draftId) {
        setCurrentDraftId(null);
        setLastSaved(null);
      }
      toast.addToast("success", t("review_builder.toast_deleted"));
    } catch {
      toast.addToast("error", t("review_builder.toast_delete_failed"));
    }
  };

  const handleRenameDraft = async (draftId: string, currentTitle: string) => {
    const nextTitle = await prompt({
      title: t("common.rename"),
      message: t("review_builder.rename_prompt"),
      initialValue: currentTitle,
    });
    if (!nextTitle || nextTitle === currentTitle) return;
    try {
      const res = await api.renameReviewDraft(draftId, nextTitle);
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
      setSavedDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, title: nextTitle } : d)));
      if (currentDraftId === draftId) {
        setTitle(nextTitle);
      }
      toast.addToast("success", t("review_builder.toast_renamed"));
    } catch {
      toast.addToast("error", t("review_builder.toast_rename_failed"));
    }
  };

  // Init ──────────────────────────────────────────────────
  useEffect(() => {
    loadPapers();
    loadDrafts();
  }, [projectId]);

  const loadPapers = async () => {
    try {
      const sourcePapers = projectId
        ? (await api.getProject(projectId)).papers
        : (await api.listPapers(1, 200)).papers;
      const next = sourcePapers.map((p) => ({
        id: p.id,
        title: paperDisplayTitle(p.title, (p as { filename?: string }).filename),
        authors: Array.isArray(p.authors) ? p.authors.join(", ") : (p.authors || ""),
        thumbnail_url: (p as any).thumbnail_url,
        auto_summary: (p as any).auto_summary,
      }));
      setPapers(next);
      const available = new Set(next.map((paper) => paper.id));
      setSelectedIds(initialPaperIds.filter((id) => available.has(id)));
      setPaperTitles(next.filter((paper) => initialPaperIds.includes(paper.id)).map((paper) => paper.title));
    } catch {
      console.error("Failed to load papers");
    }
  };

  const togglePaper = (id: string) => {
    setPreflightReport(null);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    setPreflightReport(null);
    setSelectedIds(papers.map((p) => p.id));
  };

  const deselectAll = () => {
    setPreflightReport(null);
    setSelectedIds([]);
  };

  const handleContinueToOutline = async (preserveExisting = false) => {
    if (selectedIds.length === 0) {
      toast.addToast("error", t("review_builder.error_select_one"));
      return;
    }
    if (!preserveExisting) {
      setPreflightLoading(true);
      try {
        const report = await api.reviewEvidencePreflight(selectedIds);
        setPreflightReport(report);
        if (!report.passed) {
          const message = report.blocking_issues?.[0]?.message || t("review_builder.preflight_failed");
          toast.addToast("error", message);
          return;
        }
        if (report.warnings?.length) {
          toast.addToast("warning", t("review_builder.preflight_warning", { count: report.warnings.length }));
        }
      } catch (e) {
        toast.addToast("error", t("review_builder.preflight_error", { msg: e instanceof Error ? e.message : String(e) }));
        return;
      } finally {
        setPreflightLoading(false);
      }
    }

    setStep("outline");
    setGeneratingOutline(true);
    try {
      const res = await api.generateOutline(
        selectedIds,
        preserveExisting ? outlineSections : undefined,
        preserveExisting
          ? { useCache: false, variation: Date.now() }
          : { useCache: true },
      );
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
      const detailsByKey = new Map((res.sections || []).map((item) => [item.key, item.subheadings || []]));
      setOutlineSections(getDefaultSections(t).map((item) => ({
        ...item,
        subheadings: detailsByKey.get(item.key) || [],
      })));
      setPaperTitles(res.paper_titles);
    } catch (e) {
      toast.addToast("error", t("review_builder.error_outline", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setGeneratingOutline(false);
    }
  };


  const loadEvidence = async (section: string) => {
    setEvidenceLoading((prev) => new Set(prev).add(section));
    try {
      const sectionMeta = outlineSections.find((item) => item.key === section);
      const res = await api.getEvidence(selectedIds, section, 10, sectionMeta);
      if (!res.error) {
        setEvidence((prev) => ({ ...prev, [section]: res.evidence }));
      }
    } catch {
      // silent
    } finally {
      setEvidenceLoading((prev) => {
        const next = new Set(prev);
        next.delete(section);
        return next;
      });
    }
  };

  const handleGenerateDraft = async () => {
    setGeneratingAll(true);
    setStep("review");
    setSections({});
    setFullText("");
    setGeneratingSections(new Set(outlineSections.map((s) => s.key)));

    try {
      const sectionKeys = outlineSections.map((s) => s.key);
      api.generateReviewDraftStream(selectedIds, title, sectionKeys, outlineSections, {
        onStart: (payload) => {
          setPaperTitles(payload.paper_titles || []);
        },
        onSection: (section) => {
          setSections((prev) => {
            const next = { ...prev, [section.section]: section };
            setFullText(rebuildFullText(title, next, outlineSections));
            return next;
          });
          setGeneratingSections((prev) => {
            const next = new Set(prev);
            next.delete(section.section);
            return next;
          });
        },
        onDone: (streamFullText) => {
          setFullText(streamFullText);
          setGeneratingAll(false);
          setGeneratingSections(new Set());
          for (const s of outlineSections) {
            loadEvidence(s.key);
          }
        },
        onError: (error) => {
          toast.addToast("error", error);
          setGeneratingAll(false);
          setGeneratingSections(new Set());
        },
      });
    } catch (e) {
      toast.addToast("error", t("review_builder.error_create_draft", { msg: e instanceof Error ? e.message : String(e) }));
      setGeneratingAll(false);
      setGeneratingSections(new Set());
    }
  };

  const handleGenerateSection = (sectionKey: string) => {
    // Abort any existing stream for this section
    sectionStreamRef.current?.abort();

    setGeneratingSections((prev) => new Set(prev).add(sectionKey));
    setStreamingContent((prev) => ({ ...prev, [sectionKey]: "" }));

    const sectionMeta = outlineSections.find((item) => item.key === sectionKey);
    sectionStreamRef.current = api.generateReviewSectionStream(selectedIds, sectionKey, sectionMeta, {
      onStart: () => {
        setStreamingContent((prev) => ({ ...prev, [sectionKey]: "" }));
      },
      onChunk: (_sec, delta) => {
        setStreamingContent((prev) => ({ ...prev, [sectionKey]: (prev[sectionKey] || "") + delta }));
      },
      onProgress: () => { /* keep-alive */ },
      onDone: (data) => {
        const res = data as ReviewSectionResponse & { section: string };
        setSections((prev) => {
          const updated = { ...prev, [sectionKey]: res };
          setFullText(rebuildFullText(title, updated, outlineSections));
          return updated;
        });
        setStreamingContent((prev) => { const next = { ...prev }; delete next[sectionKey]; return next; });
        setGeneratingSections((prev) => { const next = new Set(prev); next.delete(sectionKey); return next; });
        loadEvidence(sectionKey);
        sectionStreamRef.current = null;
      },
      onError: (err) => {
        toast.addToast("error", err);
        setStreamingContent((prev) => { const next = { ...prev }; delete next[sectionKey]; return next; });
        setGeneratingSections((prev) => { const next = new Set(prev); next.delete(sectionKey); return next; });
        sectionStreamRef.current = null;
      },
    });
  };

  const rebuildFullText = (reviewTitle: string, sectionMap: Record<string, ReviewSection>, outline: OutlineSection[]) => {
    const parts = [`# ${reviewTitle}\n`];
    for (const { key } of outline) {
      if (key === "bibliography") continue;
      const s = sectionMap[key];
      if (s && s.content) {
        parts.push(`\n## ${s.title}\n\n${s.content}\n`);
      }
    }
    if (sectionMap["bibliography"]?.content) {
      parts.push(`\n## ${sectionMap["bibliography"].title}\n\n${sectionMap["bibliography"].content}\n`);
    }
    parts.push(`\n---\n*${t("review_builder.generated_by")}*`);
    return parts.join("\n");
  };

  const handleGenerateMatrix = async () => {
    if (selectedIds.length < 2) {
      toast.addToast("error", t("review_builder.error_matrix_min"));
      return;
    }
    setMatrixLoading(true);
    try {
      const res = await api.generateReviewMatrix(selectedIds);
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
    } catch (e) {
      toast.addToast("error", t("review_builder.error_matrix", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setMatrixLoading(false);
    }
  };

  const handleExport = async (format: string) => {
    setExporting(true);
    try {
      const content = fullText || rebuildFullText(title, sections, outlineSections);
      if (!content.trim()) {
        toast.addToast("error", t("review_builder.error_export_empty"));
        return;
      }
      const blob = await api.exportReview(title, content, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const extension = format === "markdown" || format === "md" ? "md" : format === "docx" ? "docx" : "html";
      a.download = `${title.replace(/[^\w\-]/g, "_")}_${new Date().toISOString().slice(0, 10)}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.addToast("success", t("review_builder.toast_export_success", { format: format.toUpperCase() }));
    } catch (e) {
      toast.addToast("error", t("review_builder.toast_export_failed", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setExporting(false);
    }
  };

  const handleCheckQuality = async () => {
    if (Object.keys(sections).length === 0) {
      toast.addToast("error", t("review_builder.error_quality_empty"));
      return;
    }
    setQualityLoading(true);
    setQualityIssues([]);
    setQualityMetrics(null);
    try {
      const res = await api.checkQuality(title, sections, outlineSections, selectedIds);
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
      setQualityIssues(res.issues || []);
      setQualityMetrics(res.metrics || null);
      if (res.issues && res.issues.length > 0) {
        const highCount = res.issues.filter((i) => i.severity === "high").length;
        const mediumCount = res.issues.filter((i) => i.severity === "medium").length;
        toast.addToast(
          highCount > 0 ? "error" : "warning",
          t("review_builder.toast_quality_issues", { count: res.issues.length, high: highCount, medium: mediumCount })
        );
      } else {
        toast.addToast("success", t("review_builder.toast_quality_ok"));
      }
    } catch (e) {
      toast.addToast("error", t("review_builder.toast_quality_failed", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setQualityLoading(false);
    }
  };

  const handleSectionEdit = (sectionKey: string, newContent: string) => {
    setSections((prev) => {
      if (!prev[sectionKey]) return prev;
      return { ...prev, [sectionKey]: { ...prev[sectionKey], content: newContent } };
    });
    setEditingSection(undefined);
    setFullText(""); // force rebuild on next save/export
    setTimeout(() => doSave(), 0);
  };

  const handleCitationClick = (paperId: string, paperTitle: string, page?: number) => {
    setActivePdf({ paperId, paperTitle, page });
  };

  const handleIssueAction = (sectionKey: string, action: string, _type: string) => {
    switch (action) {
      case "add_citation":
        setActiveSection(sectionKey);
        setShowSource(true);
        if (!evidence[sectionKey]) loadEvidence(sectionKey);
        toast.addToast("info", t("review_builder.issue_add_citation"));
        break;
      case "trim_content":
        setActiveSection(sectionKey);
        toast.addToast("info", t("review_builder.issue_trim_content"));
        break;
      case "expand_content":
        handleGenerateSection(sectionKey);
        toast.addToast("info", t("review_builder.issue_expand_content"));
        break;
      case "review_conflict":
        toast.addToast("info", t("review_builder.issue_review_conflict"));
        break;
      default:
        handleGenerateSection(sectionKey);
    }
  };

  const selectedCount = selectedIds.length;

  const filteredPapers = papers.filter(p =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.authors.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sectionStatus: Record<string, "pending" | "generating" | "done" | "empty"> = {};
  for (const s of outlineSections) {
    if (generatingSections.has(s.key)) sectionStatus[s.key] = "generating";
    else if (sections[s.key]?.content) sectionStatus[s.key] = "done";
    else sectionStatus[s.key] = "pending";
  }

  const activeCitations = activeSection ? sections[activeSection]?.citations || [] : [];
  const activeEvidence = activeSection ? evidence[activeSection] || [] : [];

  return (
    <div className="u-col" style={{ height: "100%", overflow: "hidden" }}>
      {/* Header with Save indicator */}      <div className="u-row-gap12 u-px-20 u-py-12 u-border-b u-flex-shrink-0">
        <IconBookOpen size={22} className="icon-gradient" />
        <span className="u-text-lg u-font-bold">{t("review_builder.header_title")}</span>
        <div className="u-spacer" />

        {step === "review" && (
          <div className="u-row-gap8" style={{ marginRight: 8 }}>
            {saveError ? (
              <div className="u-row-gap4" style={{ fontSize: "0.7rem", color: "var(--color-error)" }}>
                <IconError size={11} />
                {t("review_builder.error_save_draft")}
              </div>
            ) : saving ? (
              <div className="u-row-gap4" style={{ fontSize: "0.7rem" }}>
                <IconSpinner size={11} />
                {t("review_builder.saving")}
              </div>
            ) : lastSaved ? (
              <div className="u-row-gap4" style={{ fontSize: "0.7rem", color: "var(--color-success)" }}>
                <IconCheck size={11} />
                {t("review_builder.saved")}
              </div>
            ) : null}
            <button
              onClick={handleManualSave}
              disabled={saving}
              className="u-btn-primary-sm"
            >
              <IconDownload size={12} />
              {t("review_builder.save")}
            </button>
            {currentDraftId && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => {
                    if (!showVersions) loadVersions(currentDraftId);
                    setShowVersions(!showVersions);
                  }}
                  className="u-btn-ghost-sm"
                >
                  <IconClock size={11} />
                  {t("review_builder.versions")}
                </button>
                {showVersions && (
                  <div style={{
                    position: "absolute", right: 0, top: "100%", marginTop: 4,
                    width: 280, maxHeight: 300, overflow: "auto",
                    background: "var(--color-surface, #1e293b)",
                    border: "1px solid var(--color-border, rgba(148,163,184,0.15))",
                    borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                    zIndex: 100, padding: 8,
                  }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-muted)", padding: "4px 8px 8px", borderBottom: "1px solid var(--color-border, rgba(148,163,184,0.08))", marginBottom: 4 }}>
                      {t("review_builder.version_history", { count: versions.length })}
                    </div>
                    {versionsLoading ? (
                      <div style={{ padding: 12, textAlign: "center" }}>
                        <IconSpinner size={14} />
                      </div>
                    ) : versions.length === 0 ? (
                      <div style={{ padding: "12px 8px", textAlign: "center", fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
                        {t("review_builder.no_versions")}
                      </div>
                    ) : (
                      versions.slice().reverse().map((v) => (
                        <div key={v.index} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 8px", borderRadius: 4,
                          fontSize: "0.72rem",
                          transition: "background 0.15s",
                        }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.06)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: "var(--color-text, #e2e8f0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {v.title}
                            </div>
                            <div style={{ color: "var(--color-text-muted)", fontSize: "0.65rem", marginTop: 1 }}>
                              {v.saved_at ? new Date(v.saved_at).toLocaleString("vi-VN") : ""} · {v.section_count} sections
                            </div>
                          </div>
                          <button
                            onClick={() => handleRestoreVersion(v.index)}
                            style={{
                              padding: "3px 8px", borderRadius: 3,
                              border: "1px solid var(--color-primary)",
                              background: "rgba(var(--color-primary-rgb), 0.08)",
                              color: "var(--color-primary)",
                              cursor: "pointer", fontSize: "0.65rem", fontWeight: 500,
                              flexShrink: 0,
                            }}
                          >{t("review_builder.restore")}</button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step !== "select" && (
          <div className="u-row-gap6">
            <span className="u-text-xs u-text-muted">
              {t("review_builder.papers_count", { count: selectedCount })}
            </span>
            <button
              onClick={() => setStep("select")}
              className="u-btn-ghost-sm"
            >
              <IconClose size={12} />
              {t("review_builder.change")}
            </button>
          </div>
        )}
      </div>

      {/* Step Indicator */}
      {step !== "select" && (
        <div className="u-row-gap8 u-px-20 u-py-8 u-flex-shrink-0" style={{ borderBottom: "1px solid var(--color-border, rgba(148,163,184,0.08))", background: "var(--color-surface, rgba(255,255,255,0.01))" }}>
          {[
            { step: "select", label: t("review_builder.step_select") },
            { step: "outline", label: t("review_builder.step_outline") },
            { step: "review", label: t("review_builder.step_review") },
          ].map((s, i) => {
            const isActive = s.step === step;
            const isDone = s.step === "select" || (s.step === "outline" && step === "review");
            return (
              <div key={s.step} className="u-row-gap6">
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isDone || isActive ? "var(--color-primary)" : "var(--color-surface-hover)",
                  color: "#fff", fontSize: "0.6rem", fontWeight: 700,
                  opacity: isDone || isActive ? 1 : 0.45,
                }}>
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      {i === 0 ? <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></> :
                       i === 1 ? <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></> :
                       <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10" /></>}
                    </svg>
                  )}
                </div>
                <span style={{
                  fontSize: "0.75rem", fontWeight: isActive ? 600 : 400,
                  color: isActive || isDone ? "var(--color-text)" : "var(--color-text-muted)",
                }}>
                  {s.label}
                </span>
                {i < 2 && <div style={{ width: 20, height: 1, background: "var(--color-border, rgba(148,163,184,0.15))" }} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div className="u-flex-1" style={{ overflow: "auto" }}>
          {/* ── Step 1: Select Papers ──────────────────────────── */}
          {step === "select" && (
            <div className="evidence-setup-layout">
              <div className="evidence-setup-main">
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
                    {t("review_builder.title_placeholder")}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 6,
                      border: "1px solid var(--color-border, rgba(148, 163, 184, 0.2))",
                      background: "var(--color-bg, rgba(0,0,0,0.05))",
                      color: "var(--color-text, #e2e8f0)", fontSize: "0.85rem",
                    }}
                    placeholder={t("review_builder.title_placeholder")}
                  />
                </div>

                <div className="evidence-controls-row">
                  <div className="evidence-search-wrapper">
                    <IconSearch size={16} className="evidence-search-icon" />
                    <input
                      type="text"
                      className="evidence-search-input"
                      placeholder="Tìm kiếm tài liệu..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="evidence-actions-group">
                    <button type="button" className="rm-btn rm-btn--xs rm-btn--chip" onClick={selectAllFiltered}>
                      {t("common.select_all")}
                    </button>
                    <button type="button" className="rm-btn rm-btn--xs rm-btn--chip" onClick={deselectAll}>
                      {t("chat.paper_picker_deselect_all")}
                    </button>
                  </div>
                </div>

                <div className="evidence-paper-list-container">
                  {filteredPapers.length === 0 ? (
                    <div className="rm-section-hint" style={{ padding: "40px 0", textAlign: "center" }}>
                      {papers.length === 0 ? t("library_view.empty_library") : "Không tìm thấy tài liệu phù hợp"}
                    </div>
                  ) : (
                    filteredPapers.map(p => {
                      const isSelected = selectedIds.includes(p.id);
                      const label = paperDisplayTitle(p.title);
                      return (
                        <div
                          key={p.id}
                          className={`evidence-paper-row${isSelected ? " selected" : ""}`}
                          onClick={() => togglePaper(p.id)}
                        >
                          <div className="evidence-row-checkbox">
                            {isSelected && <IconCheck size={14} />}
                          </div>
                          <div className="evidence-paper-thumb">
                            {p.thumbnail_url ? (
                              <img src={p.thumbnail_url} alt="" loading="lazy" />
                            ) : (
                              <IconFileText size={28} />
                            )}
                          </div>
                          <div className="evidence-paper-row-content">
                            <div className="evidence-paper-row-title-row">
                              <h3 className="evidence-paper-row-title" title={label}>{label}</h3>
                              <button
                                type="button"
                                className="evidence-paper-pdf-btn"
                                onClick={(e) => { e.stopPropagation(); handleCitationClick(p.id, label, 1); }}
                                title="Open PDF"
                              >
                                <IconFileText size={14} />
                              </button>
                            </div>
                            <div className="evidence-paper-row-meta">
                              {p.authors || t("common.unknown_author")}
                            </div>
                            {p.auto_summary && (
                              <div className="evidence-paper-row-abstract">{p.auto_summary.replace(/^#{1,6}\s+|^>\s+|[*_]{2,}|`{1,3}/gm, '').trim()}</div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="evidence-setup-sidebar">
                <div className="evidence-sidebar-btn-wrapper">
                  <button
                    type="button"
                    className="evidence-create-matrix-btn"
                    onClick={() => handleContinueToOutline(false)}
                    disabled={selectedCount === 0 || preflightLoading}
                  >
                    {preflightLoading ? <IconSpinner size={16} /> : <IconBookOpen size={16} />}
                    <span>{preflightLoading ? t("review_builder.preflight_running") : t("review_builder.continue_outline")}</span>
                  </button>
                </div>
                {preflightReport && (
                  <div style={{
                    margin: "10px 0 14px", padding: "12px", borderRadius: 10,
                    border: `1px solid ${preflightReport.passed ? "rgba(16,185,129,.3)" : "rgba(239,68,68,.3)"}`,
                    background: preflightReport.passed ? "rgba(16,185,129,.06)" : "rgba(239,68,68,.06)",
                    fontSize: "0.72rem", lineHeight: 1.5,
                  }}>
                    <div style={{ fontWeight: 700, color: preflightReport.passed ? "var(--color-success)" : "var(--color-error)" }}>
                      {preflightReport.passed ? t("review_builder.preflight_passed") : t("review_builder.preflight_blocked")}
                    </div>
                    <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>
                      {t("review_builder.preflight_metrics", {
                        ready: preflightReport.metrics.ready_papers || 0,
                        total: preflightReport.metrics.selected_papers || selectedCount,
                        chunks: preflightReport.metrics.total_chunks || 0,
                        score: preflightReport.metrics.readiness_score || 0,
                      })}
                    </div>
                    {preflightReport.blocking_issues.slice(0, 2).map((issue, index) => (
                      <div key={`${issue.code}-${index}`} style={{ color: "var(--color-error)", marginTop: 4 }}>• {issue.message}</div>
                    ))}
                    {preflightReport.warnings.length > 0 && (
                      <div style={{ color: "var(--color-warning)", marginTop: 4 }}>
                        {t("review_builder.preflight_warning", { count: preflightReport.warnings.length })}
                      </div>
                    )}
                  </div>
                )}
                <div className="evidence-sidebar-btn-wrapper">
                  <button
                    type="button"
                    className="evidence-create-matrix-btn"
                    style={{
                      background: "transparent",
                      border: "1px solid var(--color-primary)",
                      color: "var(--color-primary)",
                    }}
                    onClick={handleGenerateMatrix}
                    disabled={selectedCount < 2 || matrixLoading}
                  >
                    {matrixLoading ? <IconSpinner size={16} /> : <IconChart size={16} />}
                    <span>{matrixLoading ? t("review_builder.editor_generating") : t("review_builder.create_matrix")}</span>
                  </button>
                </div>

                <div className="evidence-drafts-header" style={{ marginTop: 20 }}>
                  <span className="evidence-drafts-title">
                    {t("evidence.drafts_label", { n: savedDrafts.length })}
                  </span>
                </div>

                <div className="evidence-sidebar-drafts-list">
                  {savedDrafts.length === 0 ? (
                    <div className="rm-section-hint" style={{ fontSize: "12px", textAlign: "center", padding: "20px 0" }}>
                      Không có bản nháp nào
                    </div>
                  ) : (
                    savedDrafts.map(entry => (
                      <div key={entry.id} className="evidence-sidebar-draft-card">
                        <div className="evidence-draft-card-header">
                          <h4 className="evidence-draft-card-title">{entry.title}</h4>
                        </div>
                        <div className="evidence-draft-card-meta">
                          <span>
                            <IconFileText size={11} /> {entry.paper_count} papers
                          </span>
                          <span>
                            <IconBookOpen size={11} /> {entry.section_count} sections
                          </span>
                        </div>
                        <div className="evidence-draft-card-actions">
                          <div className="evidence-draft-card-action-btns">
                            <button
                              type="button"
                              className="evidence-draft-card-icon-btn"
                              onClick={(e) => { e.stopPropagation(); handleRenameDraft(entry.id, entry.title); }}
                              title={t("review_builder.rename_draft_title")}
                            >
                              <IconEdit size={12} />
                            </button>
                            <button
                              type="button"
                              className="evidence-draft-card-icon-btn"
                              onClick={(e) => { e.stopPropagation(); handleDeleteDraft(entry.id); }}
                              title={t("evidence.delete_btn")}
                            >
                              <IconTrash size={12} />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="evidence-draft-card-continue-btn"
                            onClick={() => handleLoadDraft(entry.id)}
                          >
                            <span>{t("common.open")}</span>
                            <span>&rarr;</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Outline ───────────────────────────────── */}
          {step === "outline" && (
            <>
              <div className="u-mb-16">
                <h2 className="u-row-gap8" style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
                  <IconBookOpen size={18} className="icon-gradient" />
                  {t("review_builder.outline_header")}
                </h2>
                <div className="u-text-sm u-text-muted u-mt-4">
                  {t("review_builder.outline_selected_info", { count: paperTitles.length })}
                </div>
              </div>

              {generatingOutline ? (
                <div className="u-row-gap8 u-text-center u-text-muted u-text-base u-p-40" style={{ justifyContent: "center" }}>
                  <IconSpinner size={18} />
                  <span>{t("review_builder.generating_outline")}</span>
                </div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  {outlineSections.map((sec) => (
                    <SectionCard
                      key={sec.key}
                      section={sec.key}
                      title={sec.title}
                      description={sec.description}
                      subheadings={sec.subheadings}
                      status="pending"
                      onGenerate={() => {
                        setStep("review");
                        handleGenerateSection(sec.key);
                      }}
                    />
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleGenerateDraft}
                  disabled={generatingAll}
                  className="u-btn-primary"
                >
                  {generatingAll ? <IconSpinner size={16} /> : <IconBookOpen size={16} />}
                  {generatingAll ? t("review_builder.generating_draft_all") : t("review_builder.generate_full_review")}
                </button>
                <button
                  onClick={() => handleContinueToOutline(true)}
                  disabled={generatingOutline}
                  className="u-btn-ghost-sm" style={{ padding: "10px 20px", fontSize: "0.85rem" }}
                >
                  <IconRefresh size={16} />
                  {t("review_builder.regenerate_outline")}
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Review ────────────────────────────────── */}
          {step === "review" && (
            <>
              <div className="u-mb-16">
                <h2 className="u-text-base u-font-semibold" style={{ margin: 0 }}>{title}</h2>
                <div className="u-row-wrap u-text-sm u-text-muted u-mt-4" style={{ gap: 4 }}>
                  {paperTitles.map((t, i) => (
                    <span key={i} className="u-row-gap2">
                      <IconFileText size={12} />
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {outlineSections.map((sec) => {
                const secData = sections[sec.key];
                const secIssues = qualityIssues.filter((i) => i.section === sec.key);
                const isEditing = editingSection === sec.key;
                return (
                  <div key={sec.key}>
                    <SectionCard
                      section={sec.key}
                      title={sec.title}
                      description={sec.description}
                      content={streamingContent[sec.key] ?? secData?.content}
                      loading={generatingSections.has(sec.key)}
                      evidenceCount={secData?.chunks_used || evidence[sec.key]?.length}
                      paperCount={secData?.papers_used?.length}
                      status={sectionStatus[sec.key]}
                      issues={secIssues.length > 0 ? secIssues : undefined}
                      citations={secData?.citations}
                      isStreaming={sec.key in streamingContent}
                      onGenerate={handleGenerateSection}
                      onEdit={(key) => {
                        setActiveSection(key);
                        setEditingSection(key);
                      }}
                      onIssueAction={handleIssueAction}
                      onCitationClick={handleCitationClick}
                    />
                    {isEditing && (
                      <div style={{ marginTop: -8, marginBottom: 12 }}>
                        <ReviewSectionEditor
                          section={sec.key}
                          title={sec.title}
                          content={secData?.content || ""}
                          citations={secData?.citations}
                          evidenceCount={secData?.chunks_used || evidence[sec.key]?.length}
                          paperCount={secData?.papers_used?.length}
                          onRegenerate={handleGenerateSection}
                          onChange={handleSectionEdit}
                          onClose={() => setEditingSection(undefined)}
                          onCitationClick={handleCitationClick}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Quality Check */}
              <div className="u-row-wrap u-p-0" style={{ gap: 8, paddingTop: "8px", paddingBottom: 0 }}>
                <button
                  onClick={handleCheckQuality}
                  disabled={qualityLoading}
                  className="u-btn-outline-sm"
                >
                  {qualityLoading ? <IconSpinner size={14} /> : <IconZap size={14} />}
                  {qualityLoading ? t("review_builder.checking_quality") : t("review_builder.check_quality")}
                </button>
                {qualityMetrics && (
                  <span className="u-row-gap4" style={{ fontSize: "0.75rem", fontWeight: 600, color: qualityMetrics.passed ? "var(--color-success)" : "var(--color-warning)" }}>
                    {t("review_builder.quality_score", { score: qualityMetrics.academic_score, coverage: qualityMetrics.claim_citation_coverage })}
                  </span>
                )}
                {qualityIssues.length > 0 && (
                  <span className="u-row-gap4" style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {qualityIssues.filter((i) => i.severity === "high").length > 0 && (
                      <span style={{ color: "var(--color-error)", fontWeight: 600 }}>
                        {qualityIssues.filter((i) => i.severity === "high").length} {t("review_builder.severity_high")}
                      </span>
                    )}
                    {qualityIssues.filter((i) => i.severity === "medium").length > 0 && (
                      <span style={{ color: "var(--color-warning)", fontWeight: 600 }}>
                        {qualityIssues.filter((i) => i.severity === "medium").length} {t("review_builder.severity_medium")}
                      </span>
                    )}
                    {qualityIssues.filter((i) => i.severity === "low").length > 0 && (
                      <span>
                        {qualityIssues.filter((i) => i.severity === "low").length} {t("review_builder.severity_low")}
                      </span>
                    )}
                  </span>
                )}
              </div>

              <div className="u-row-wrap" style={{ gap: 8, padding: "12px 0", borderTop: "1px solid var(--color-border, rgba(148,163,184,0.1))" }}>
                <span className="u-row-gap6 u-text-base u-font-semibold u-text-muted" style={{ marginRight: 8 }}>
                  <IconDownload size={16} />
                  {t("review_builder.export_label")}
                </span>
                {["markdown", "html", "docx"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleExport(fmt)}
                    disabled={exporting}
                    className="u-btn-outline-sm"
                  >
                    {exporting ? <IconSpinner size={14} /> : <IconDownload size={14} />}
                    {fmt === "markdown" ? "Markdown" : fmt === "html" ? "HTML" : "Word"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Progress Sidebar (Step 3 only) */}
        {step === "review" && (
          <>
            {showSidebar ? (
              <ProgressSidebar
                sections={outlineSections}
                sectionStatus={sectionStatus}
                activeSection={activeSection}
                onSectionClick={(key) => {
                  setActiveSection(key);
                  setShowSource(true);
                  if (!evidence[key]) loadEvidence(key);
                }}
                onClose={() => setShowSidebar(false)}
              />
            ) : (
              <button
                onClick={() => setShowSidebar(true)}
                title={t("review_builder.show_outline")}
                style={{
                  width: 24, flexShrink: 0,
                  border: "none",
                  borderLeft: "1px solid var(--color-border, rgba(148,163,184,0.1))",
                  background: "var(--color-surface, rgba(255,255,255,0.01))",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  fontSize: "0.7rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  writingMode: "vertical-rl",
                  letterSpacing: 2,
                }}
              >
                {t("review_builder.outline_toggle")}
              </button>
            )}
          </>
        )}

        {/* Source Panel */}
        {step === "review" && showSource && (
          <SourcePanel
            citations={activeCitations}
            evidence={activeEvidence}
            onClose={() => setShowSource(false)}
            onCitationClick={handleCitationClick}
          />
        )}

        {/* PDF Overlay */}
        {activePdf && (
          <div className="rm-overlay evidence-pdf-overlay" onClick={() => setActivePdf(null)}>
            <div ref={pdfDialogRef} className="rm-modal" role="dialog" aria-modal="true" aria-labelledby="review-pdf-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
              <div className="rm-modal-header">
                <span id="review-pdf-title" className="rm-modal-title">
                  {activePdf.paperTitle}{activePdf.page ? ` — ${t("review_builder.pdf_page_label", { page: activePdf.page })}` : ""}
                </span>
                <button type="button" className="rm-modal-close" aria-label={t("common.close")} onClick={() => setActivePdf(null)}>✕</button>
              </div>
              <iframe
                src={getAuthenticatedApiUrl(`/api/papers/${activePdf.paperId}/file${activePdf.page ? `#page=${activePdf.page}` : ""}`)}
                style={{ flex: 1, border: "none" }}
                title={t("review_builder.pdf_preview")}
              />
            </div>
          </div>
        )}
        {confirmationDialog}
        {promptDialog}
      </div>
    </div>
  );
}
