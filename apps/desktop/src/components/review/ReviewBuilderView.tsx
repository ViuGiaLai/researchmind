import { useState, useEffect, useRef, useCallback } from "react";
import { api, ReviewSection, OutlineSection, EvidenceItem, ReviewDraftSummary, DraftVersionSummary, QualityIssue } from "../../lib/api";
import { SectionCard } from "./SectionCard";
import { ReviewSectionEditor } from "./ReviewSectionEditor";
import { ProgressSidebar } from "./ProgressSidebar";
import { SourcePanel } from "./SourcePanel";
import { useToast } from "../shared/Toast";
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
} from "../Icons";

const DEFAULT_SECTIONS: OutlineSection[] = [
  { key: "background", title: "1. Background", description: "Tổng quan về lĩnh vực nghiên cứu" },
  { key: "related_work", title: "2. Related Work", description: "Các công trình liên quan" },
  { key: "methodology_comparison", title: "3. Methodology Comparison", description: "So sánh phương pháp" },
  { key: "findings", title: "4. Findings", description: "Kết quả nghiên cứu chính" },
  { key: "limitations", title: "5. Limitations", description: "Hạn chế của các nghiên cứu" },
  { key: "research_gaps", title: "6. Research Gaps", description: "Khoảng trống nghiên cứu" },
  { key: "future_directions", title: "7. Future Directions", description: "Hướng phát triển tương lai" },
  { key: "bibliography", title: "8. Bibliography", description: "Danh mục tài liệu tham khảo" },
];

type Step = "select" | "outline" | "review";

export function ReviewBuilderView() {
  const [papers, setPapers] = useState<{ id: string; title: string; authors: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("Literature Review");
  const [step, setStep] = useState<Step>("select");
  const [sections, setSections] = useState<Record<string, ReviewSection>>({});
  const [outlineSections, setOutlineSections] = useState<OutlineSection[]>(DEFAULT_SECTIONS);
  const [fullText, setFullText] = useState("");
  const [paperTitles, setPaperTitles] = useState<string[]>([]);
  const [generatingSections, setGeneratingSections] = useState<Set<string>>(new Set());
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, EvidenceItem[]>>({});
  const [, setEvidenceLoading] = useState<Set<string>>(new Set());
  const [showSource, setShowSource] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeSection, setActiveSection] = useState<string | undefined>();
  const [editingSection, setEditingSection] = useState<string | undefined>();
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
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
      const msg = e instanceof Error ? e.message : "Lỗi lưu draft";
      setSaveError(msg);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      toast.addToast("error", `Lưu thất bại: ${msg}`);
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
    if (ok) toast.addToast("success", "Đã lưu draft.");
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
    if (!window.confirm("Bạn có chắc muốn khôi phục phiên bản này? Bản hiện tại sẽ được lưu lại trong version history.")) return;
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
      setOutlineSections(data.outline_sections || DEFAULT_SECTIONS);
      setSections(data.sections || {});
      setFullText(data.full_text || "");
      setShowVersions(false);
      loadVersions(currentDraftId);
      toast.addToast("success", "Đã khôi phục phiên bản cũ.");
    } catch (e) {
      toast.addToast("error", "Khôi phục thất bại: " + (e instanceof Error ? e.message : String(e)));
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
      setOutlineSections(data.outline_sections || DEFAULT_SECTIONS);
      setSections(data.sections || {});
      setFullText(data.full_text || "");
      setStep("review");
      setShowVersions(false);
      loadVersions(draftId);
      toast.addToast("success", `Đã tải draft: ${data.title}`);
    } catch (e) {
      toast.addToast("error", "Lỗi khi tải draft: " + (e instanceof Error ? e.message : String(e)));
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
      toast.addToast("success", "Đã xoá draft.");
    } catch {
      toast.addToast("error", "Lỗi khi xoá draft.");
    }
  };

  // ─── Init ──────────────────────────────────────────────────
  useEffect(() => {
    loadPapers();
    loadDrafts();
  }, []);

  const loadPapers = async () => {
    try {
      const data = await api.listPapers(1, 200);
      setPapers(data.papers.map((p) => ({ id: p.id, title: p.title || p.filename, authors: p.authors || "" })));
    } catch {
      console.error("Failed to load papers");
    }
  };

  const togglePaper = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    setSelectedIds(papers.map((p) => p.id));
  };

  const deselectAll = () => {
    setSelectedIds([]);
  };

  const handleContinueToOutline = async () => {
    if (selectedIds.length === 0) {
      toast.addToast("error", "Vui lòng chọn ít nhất 1 tài liệu.");
      return;
    }
    setStep("outline");
    setGeneratingOutline(true);
    try {
      const res = await api.generateOutline(selectedIds, outlineSections);
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
      setOutlineSections(res.sections);
      setPaperTitles(res.paper_titles);
    } catch (e) {
      toast.addToast("error", "Lỗi khi sinh outline: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGeneratingOutline(false);
    }
  };

  const loadEvidence = async (section: string) => {
    setEvidenceLoading((prev) => new Set(prev).add(section));
    try {
      const res = await api.getEvidence(selectedIds, section, 10);
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
      api.generateReviewDraftStream(selectedIds, title, sectionKeys, {
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
      toast.addToast("error", "Lỗi khi tạo draft: " + (e instanceof Error ? e.message : String(e)));
      setGeneratingAll(false);
      setGeneratingSections(new Set());
    }
  };

  const handleGenerateSection = async (sectionKey: string) => {
    setGeneratingSections((prev) => new Set(prev).add(sectionKey));
    try {
      const res = await api.generateReviewSection(selectedIds, sectionKey);
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
      setSections((prev) => ({ ...prev, [sectionKey]: res }));
      setFullText(rebuildFullText(title, { ...sections, [sectionKey]: res }, outlineSections));
      loadEvidence(sectionKey);
    } catch (e) {
      toast.addToast("error", "Lỗi khi tạo section: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGeneratingSections((prev) => {
        const next = new Set(prev);
        next.delete(sectionKey);
        return next;
      });
    }
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
    parts.push(`\n---\n*Bài Literature Review được tạo tự động bởi ResearchMind AI.*`);
    return parts.join("\n");
  };

  const handleGenerateMatrix = async () => {
    if (selectedIds.length < 2) {
      toast.addToast("error", "Cần ít nhất 2 tài liệu để tạo ma trận so sánh.");
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
      toast.addToast("error", "Lỗi khi tạo ma trận: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setMatrixLoading(false);
    }
  };

  const handleExport = async (format: string) => {
    setExporting(true);
    try {
      const content = fullText || rebuildFullText(title, sections, outlineSections);
      if (!content.trim()) {
        toast.addToast("error", "Không có nội dung để xuất.");
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
      toast.addToast("success", `Đã tải xuống định dạng ${format.toUpperCase()}`);
    } catch (e) {
      toast.addToast("error", "Xuất thất bại: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  const handleCheckQuality = async () => {
    if (Object.keys(sections).length === 0) {
      toast.addToast("error", "Chưa có nội dung để kiểm tra.");
      return;
    }
    setQualityLoading(true);
    setQualityIssues([]);
    try {
      const res = await api.checkQuality(title, sections);
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
      setQualityIssues(res.issues || []);
      if (res.issues && res.issues.length > 0) {
        const highCount = res.issues.filter((i) => i.severity === "high").length;
        const mediumCount = res.issues.filter((i) => i.severity === "medium").length;
        toast.addToast(
          highCount > 0 ? "error" : "warning",
          `Tìm thấy ${res.issues.length} vấn đề (${highCount} nghiêm trọng, ${mediumCount} trung bình)`
        );
      } else {
        toast.addToast("success", "Không tìm thấy vấn đề nào! Chất lượng tốt.");
      }
    } catch (e) {
      toast.addToast("error", "Kiểm tra chất lượng thất bại: " + (e instanceof Error ? e.message : String(e)));
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

  const handleIssueAction = (sectionKey: string, action: string, _type: string) => {
    switch (action) {
      case "add_citation":
        setActiveSection(sectionKey);
        setShowSource(true);
        if (!evidence[sectionKey]) loadEvidence(sectionKey);
        toast.addToast("info", "Mở source panel — thêm citation từ evidence bên phải.");
        break;
      case "trim_content":
        setActiveSection(sectionKey);
        toast.addToast("info", "Mở section để rút gọn nội dung.");
        break;
      case "expand_content":
        handleGenerateSection(sectionKey);
        toast.addToast("info", "Đang tạo lại section với nội dung mở rộng.");
        break;
      case "review_conflict":
        toast.addToast("info", "Xem xét mâu thuẫn — kiểm tra manual.");
        break;
      default:
        handleGenerateSection(sectionKey);
    }
  };

  const selectedCount = selectedIds.length;

  const sectionStatus: Record<string, "pending" | "generating" | "done" | "empty"> = {};
  for (const s of outlineSections) {
    if (generatingSections.has(s.key)) sectionStatus[s.key] = "generating";
    else if (sections[s.key]?.content) sectionStatus[s.key] = "done";
    else sectionStatus[s.key] = "pending";
  }

  const activeCitations = activeSection ? sections[activeSection]?.citations || [] : [];
  const activeEvidence = activeSection ? evidence[activeSection] || [] : [];

  return (
    <div className="review-builder" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header with Save indicator */}
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--color-border, rgba(148, 163, 184, 0.15))",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <IconBookOpen size={22} className="icon-gradient" />
        <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>Literature Review Builder</span>
        <div style={{ flex: 1 }} />

        {step === "review" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
            {saveError ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.7rem", color: "#ef4444" }}>
                <IconError size={11} />
                Lỗi lưu
              </div>
            ) : saving ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.7rem", color: "var(--color-text-muted, #94a3b8)" }}>
                <IconSpinner size={11} />
                Đang lưu...
              </div>
            ) : lastSaved ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.7rem", color: "#22c55e" }}>
                <IconCheck size={11} />
                Đã lưu
              </div>
            ) : null}
            <button
              onClick={handleManualSave}
              disabled={saving}
              style={{
                padding: "4px 10px", borderRadius: 4,
                border: "1px solid var(--color-primary, #6366f1)",
                background: "rgba(99, 102, 241, 0.08)",
                color: "var(--color-primary, #6366f1)",
                cursor: "pointer", fontSize: "0.75rem", fontWeight: 500,
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <IconDownload size={12} />
              Save
            </button>
            {currentDraftId && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => {
                    if (!showVersions) loadVersions(currentDraftId);
                    setShowVersions(!showVersions);
                  }}
                  style={{
                    padding: "4px 8px", borderRadius: 4,
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    background: showVersions ? "rgba(99, 102, 241, 0.08)" : "transparent",
                    color: "var(--color-text-muted, #94a3b8)",
                    cursor: "pointer", fontSize: "0.72rem",
                    display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <IconClock size={11} />
                  Versions
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
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-muted, #94a3b8)", padding: "4px 8px 8px", borderBottom: "1px solid var(--color-border, rgba(148,163,184,0.08))", marginBottom: 4 }}>
                      Version History ({versions.length})
                    </div>
                    {versionsLoading ? (
                      <div style={{ padding: 12, textAlign: "center" }}>
                        <IconSpinner size={14} />
                      </div>
                    ) : versions.length === 0 ? (
                      <div style={{ padding: "12px 8px", textAlign: "center", fontSize: "0.72rem", color: "var(--color-text-muted, #94a3b8)" }}>
                        Chưa có phiên bản cũ
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
                            <div style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: "0.65rem", marginTop: 1 }}>
                              {v.saved_at ? new Date(v.saved_at).toLocaleString("vi-VN") : ""} · {v.section_count} sections
                            </div>
                          </div>
                          <button
                            onClick={() => handleRestoreVersion(v.index)}
                            style={{
                              padding: "3px 8px", borderRadius: 3,
                              border: "1px solid var(--color-primary, #6366f1)",
                              background: "rgba(99, 102, 241, 0.08)",
                              color: "var(--color-primary, #6366f1)",
                              cursor: "pointer", fontSize: "0.65rem", fontWeight: 500,
                              flexShrink: 0,
                            }}
                          >Khôi phục</button>
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
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted, #94a3b8)" }}>
              {selectedCount} papers
            </span>
            <button
              onClick={() => setStep("select")}
              style={{
                padding: "4px 10px", borderRadius: 6,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "transparent",
                color: "var(--color-text-muted, #94a3b8)",
                cursor: "pointer", fontSize: "0.72rem",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <IconClose size={12} />
              Change
            </button>
          </div>
        )}
      </div>

      {/* Step Indicator */}
      {step !== "select" && (
        <div style={{
          display: "flex", gap: 8, padding: "8px 20px",
          borderBottom: "1px solid var(--color-border, rgba(148, 163, 184, 0.08))",
          background: "var(--color-surface, rgba(255,255,255,0.01))",
          flexShrink: 0,
        }}>
          {[
            { step: "select", label: "Select Papers" },
            { step: "outline", label: "Outline" },
            { step: "review", label: "Review" },
          ].map((s, i) => {
            const isActive = s.step === step;
            // step !== "select" already guaranteed by outer condition
            const isDone = s.step === "select" || (s.step === "outline" && step === "review");
            return (
              <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isDone ? "var(--color-success, #22c55e)" : isActive ? "var(--color-primary, #6366f1)" : "var(--color-border, rgba(148,163,184,0.2))",
                  color: "#fff", fontSize: "0.65rem", fontWeight: 700,
                }}>
                  {isDone ? <IconCheck size={12} /> : i + 1}
                </div>
                <span style={{
                  fontSize: "0.75rem", fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--color-text, #e2e8f0)" : "var(--color-text-muted, #94a3b8)",
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
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {/* ── Step 1: Select Papers ──────────────────────────── */}
          {step === "select" && (
            <>
              <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={{ display: "block", fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", marginBottom: 4 }}>
                    Tiêu đề Literature Review
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
                    placeholder="Nhập tiêu đề..."
                  />
                </div>
                <div style={{ display: "flex", gap: 6, alignSelf: "flex-end" }}>
                  <button onClick={selectAllFiltered} style={{
                    padding: "6px 12px", borderRadius: 6,
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    background: "transparent", color: "var(--color-text-muted, #94a3b8)",
                    cursor: "pointer", fontSize: "0.78rem",
                  }}>Chọn tất cả</button>
                  <button onClick={deselectAll} style={{
                    padding: "6px 12px", borderRadius: 6,
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    background: "transparent", color: "var(--color-text-muted, #94a3b8)",
                    cursor: "pointer", fontSize: "0.78rem",
                  }}>Bỏ chọn</button>
                </div>
              </div>

              <div style={{
                display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16,
                maxHeight: 260, overflow: "auto", padding: 4,
              }}>
                {papers.map((p) => {
                  const selected = selectedIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => togglePaper(p.id)}
                      style={{
                        padding: "8px 14px", borderRadius: 8,
                        border: `1px solid ${selected ? "var(--color-primary, #6366f1)" : "var(--color-border, rgba(148, 163, 184, 0.15))"}`,
                        background: selected ? "rgba(99, 102, 241, 0.08)" : "var(--color-surface, rgba(255, 255, 255, 0.02))",
                        cursor: "pointer", fontSize: "0.82rem",
                        color: selected ? "var(--color-primary, #6366f1)" : "var(--color-text, #e2e8f0)",
                        transition: "all 0.15s", userSelect: "none",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {selected ? <IconCheck size={14} style={{ color: "var(--color-primary, #6366f1)" }} /> : <IconFileText size={14} />}
                      {p.title}
                    </div>
                  );
                })}
                {papers.length === 0 && (
                  <div style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: "0.85rem", padding: 20 }}>
                    Chưa có tài liệu nào trong thư viện.
                  </div>
                )}
              </div>

              {selectedCount > 0 && (
                <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", marginBottom: 12 }}>
                  Đã chọn <strong>{selectedCount}</strong> tài liệu
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
                <button
                  onClick={handleContinueToOutline}
                  disabled={selectedCount === 0}
                  style={{
                    padding: "10px 24px", borderRadius: 8, border: "none",
                    background: "var(--color-primary, #6366f1)", color: "#fff",
                    cursor: "pointer", fontSize: "0.85rem", fontWeight: 600,
                    opacity: selectedCount === 0 ? 0.5 : 1,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  Tiếp tục → Sinh Outline
                </button>
                <button
                  onClick={handleGenerateMatrix}
                  disabled={selectedCount < 2 || matrixLoading}
                  style={{
                    padding: "10px 20px", borderRadius: 8,
                    border: "1px solid var(--color-primary, #6366f1)",
                    background: "transparent", color: "var(--color-primary, #6366f1)",
                    cursor: "pointer", fontSize: "0.85rem", fontWeight: 500,
                    opacity: selectedCount < 2 || matrixLoading ? 0.5 : 1,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {matrixLoading ? <IconSpinner size={16} /> : <IconChart size={16} />}
                  {matrixLoading ? "Đang tạo..." : "Tạo ma trận so sánh"}
                </button>
              </div>

              {/* Saved Drafts */}
              {savedDrafts.length > 0 && (
                <div>
                  <h3 style={{
                    fontSize: "0.85rem", fontWeight: 600, margin: "0 0 12px",
                    display: "flex", alignItems: "center", gap: 6,
                    color: "var(--color-text, #e2e8f0)",
                  }}>
                    <IconClock size={16} className="icon-gradient" />
                    Drafts đã lưu ({savedDrafts.length})
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {savedDrafts.map((d) => (
                      <div key={d.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "10px 14px", borderRadius: 8,
                        border: "1px solid var(--color-border, rgba(148, 163, 184, 0.12))",
                        background: "var(--color-surface, rgba(255,255,255,0.02))",
                      }}>
                        <IconFileText size={16} style={{ color: "var(--color-primary, #6366f1)", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text, #e2e8f0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {d.title}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted, #94a3b8)", display: "flex", gap: 8, marginTop: 2 }}>
                            <span>{d.paper_count} papers</span>
                            <span>{d.section_count} sections</span>
                            <span>{d.updated_at ? new Date(d.updated_at).toLocaleDateString("vi-VN") : ""}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleLoadDraft(d.id)}
                          style={{
                            padding: "4px 10px", borderRadius: 4,
                            border: "1px solid var(--color-primary, #6366f1)",
                            background: "rgba(99, 102, 241, 0.08)",
                            color: "var(--color-primary, #6366f1)",
                            cursor: "pointer", fontSize: "0.72rem", fontWeight: 500,
                          }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeleteDraft(d.id)}
                          style={{
                            padding: "4px 8px", borderRadius: 4,
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            background: "transparent",
                            color: "var(--color-error, #ef4444)",
                            cursor: "pointer", fontSize: "0.72rem",
                            display: "flex", alignItems: "center",
                          }}
                        >
                          <IconTrash size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Outline ───────────────────────────────── */}
          {step === "outline" && (
            <>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <IconBookOpen size={18} className="icon-gradient" />
                  Literature Review Outline
                </h2>
                <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", marginTop: 4 }}>
                  {paperTitles.length} papers selected — outline generated by AI
                </div>
              </div>

              {generatingOutline ? (
                <div style={{
                  padding: "40px", textAlign: "center",
                  color: "var(--color-text-muted, #94a3b8)", fontSize: "0.85rem",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <IconSpinner size={18} />
                  <span>Đang phân tích tài liệu và sinh outline...</span>
                </div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  {outlineSections.map((sec) => (
                    <SectionCard
                      key={sec.key}
                      section={sec.key}
                      title={sec.title}
                      description={sec.description}
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
                  style={{
                    padding: "10px 24px", borderRadius: 8, border: "none",
                    background: "var(--color-primary, #6366f1)", color: "#fff",
                    cursor: "pointer", fontSize: "0.85rem", fontWeight: 600,
                    opacity: generatingAll ? 0.5 : 1,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {generatingAll ? <IconSpinner size={16} /> : <IconBookOpen size={16} />}
                  {generatingAll ? "Đang tạo draft..." : "Generate Full Review"}
                </button>
                <button
                  onClick={handleContinueToOutline}
                  disabled={generatingOutline}
                  style={{
                    padding: "10px 20px", borderRadius: 8,
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    background: "transparent", color: "var(--color-text-muted, #94a3b8)",
                    cursor: "pointer", fontSize: "0.85rem",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <IconRefresh size={16} />
                  Regenerate Outline
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Review ────────────────────────────────── */}
          {step === "review" && (
            <>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{title}</h2>
                <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {paperTitles.map((t, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
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
                      content={secData?.content}
                      loading={generatingSections.has(sec.key)}
                      evidenceCount={secData?.chunks_used || evidence[sec.key]?.length}
                      paperCount={secData?.papers_used?.length}
                      status={sectionStatus[sec.key]}
                      issues={secIssues.length > 0 ? secIssues : undefined}
                      onGenerate={handleGenerateSection}
                      onEdit={(key) => {
                        setActiveSection(key);
                        setEditingSection(key);
                      }}
                      onIssueAction={handleIssueAction}
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
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Quality Check */}
              <div style={{
                display: "flex", gap: 8, padding: "8px 0",
                flexWrap: "wrap", alignItems: "center",
              }}>
                <button
                  onClick={handleCheckQuality}
                  disabled={qualityLoading}
                  style={{
                    padding: "8px 16px", borderRadius: 6,
                    border: "1px solid var(--color-primary, #6366f1)",
                    background: qualityLoading ? "rgba(99, 102, 241, 0.08)" : "rgba(99, 102, 241, 0.08)",
                    color: "var(--color-primary, #6366f1)",
                    cursor: qualityLoading ? "not-allowed" : "pointer",
                    fontSize: "0.82rem", fontWeight: 500,
                    opacity: qualityLoading ? 0.5 : 1,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {qualityLoading ? <IconSpinner size={14} /> : <IconZap size={14} />}
                  {qualityLoading ? "Đang kiểm tra..." : "Kiểm tra chất lượng"}
                </button>
                {qualityIssues.length > 0 && (
                  <span style={{
                    fontSize: "0.75rem", color: "var(--color-text-muted, #94a3b8)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {qualityIssues.filter((i) => i.severity === "high").length > 0 && (
                      <span style={{ color: "#ef4444", fontWeight: 600 }}>
                        {qualityIssues.filter((i) => i.severity === "high").length} high
                      </span>
                    )}
                    {qualityIssues.filter((i) => i.severity === "medium").length > 0 && (
                      <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                        {qualityIssues.filter((i) => i.severity === "medium").length} medium
                      </span>
                    )}
                    {qualityIssues.filter((i) => i.severity === "low").length > 0 && (
                      <span>
                        {qualityIssues.filter((i) => i.severity === "low").length} low
                      </span>
                    )}
                  </span>
                )}
              </div>

              <div style={{
                display: "flex", gap: 8, padding: "12px 0",
                borderTop: "1px solid var(--color-border, rgba(148, 163, 184, 0.1))",
                flexWrap: "wrap",
              }}>
                <span style={{
                  fontSize: "0.82rem", fontWeight: 600,
                  color: "var(--color-text-muted, #94a3b8)",
                  display: "flex", alignItems: "center", gap: 6, marginRight: 8,
                }}>
                  <IconDownload size={16} />
                  Xuất báo cáo:
                </span>
                {["markdown", "html", "docx"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleExport(fmt)}
                    disabled={exporting}
                    style={{
                      padding: "8px 16px", borderRadius: 6,
                      border: "1px solid var(--color-primary, #6366f1)",
                      background: "transparent", color: "var(--color-primary, #6366f1)",
                      cursor: exporting ? "not-allowed" : "pointer",
                      fontSize: "0.82rem", fontWeight: 500,
                      opacity: exporting ? 0.5 : 1,
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    {exporting ? <IconSpinner size={14} /> : <IconDownload size={14} />}
                    {fmt === "markdown" ? "Markdown" : fmt === "html" ? "HTML" : "Word (DOCX)"}
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
                title="Show outline"
                style={{
                  width: 24, flexShrink: 0,
                  border: "none",
                  borderLeft: "1px solid var(--color-border, rgba(148,163,184,0.1))",
                  background: "var(--color-surface, rgba(255,255,255,0.01))",
                  cursor: "pointer",
                  color: "var(--color-text-muted, #94a3b8)",
                  fontSize: "0.7rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  writingMode: "vertical-rl",
                  letterSpacing: 2,
                }}
              >
                Outline ▸
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
          />
        )}
      </div>
    </div>
  );
}
