import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api, Paper } from "../../lib/api";
import { paperDisplayTitle } from "../../lib/paperDisplay";
import {
  IconSpinner,
  IconCheck,
  IconError,
  IconUpload,
  IconBrain,
  IconFileText,
  IconChat,
  IconSparkle,
  IconWarning,
  IconSwords,
  IconCircleDot,
  IconBrainAi,
  IconZap,
  IconRotateCcw,
  IconArrowDown,
  IconWithText,
} from "../Icons";
import { useToast } from "../shared/Toast";
import "./WowAnalysisView.css";

interface StepState {
  status: "pending" | "running" | "completed" | "error";
  content: string;
  error?: string;
  citations?: { source: string; page: number | null; text: string }[];
  modelUsed?: string;
}

interface WowAnalysisViewProps {
  onStartChat: (paperIds: string[]) => void;
  onStartDebate?: (paperIds: string[]) => void;
  initialPaperId?: string | null;
  onClearInitialPaperId?: () => void;
}

const WOW_STEP_META_FN = (t: (key: string) => string) => ({
  summary: { label: t("wow.step_summary"), Icon: IconSparkle },
  critique: { label: t("wow.step_critique"), Icon: IconWarning },
  conflict: { label: t("wow.step_conflict"), Icon: IconSwords },
  gap: { label: t("wow.step_gap"), Icon: IconCircleDot },
  debate: { label: t("wow.step_debate"), Icon: IconBrainAi },
} as const);

const WOW_STEPS = [
  { key: "summary" as const, color: "#10b981" },
  { key: "critique" as const, color: "#ef4444" },
  { key: "conflict" as const, color: "#f59e0b" },
  { key: "gap" as const, color: "#2dd4bf" },
  { key: "debate" as const, color: "#06b6d4" },
];

const LOADER_MESSAGES_KEYS: Record<string, string[]> = {
  summary: ["wow.loader_summary_1", "wow.loader_summary_2", "wow.loader_summary_3", "wow.loader_summary_4"],
  critique: ["wow.loader_critique_1", "wow.loader_critique_2", "wow.loader_critique_3", "wow.loader_critique_4"],
  conflict: ["wow.loader_conflict_1", "wow.loader_conflict_2", "wow.loader_conflict_3", "wow.loader_conflict_4"],
  gap: ["wow.loader_gap_1", "wow.loader_gap_2", "wow.loader_gap_3", "wow.loader_gap_4"],
  debate: ["wow.loader_debate_1", "wow.loader_debate_2", "wow.loader_debate_3", "wow.loader_debate_4"],
};

export const WowAnalysisView: React.FC<WowAnalysisViewProps> = ({
  onStartChat,
  onStartDebate,
  initialPaperId,
  onClearInitialPaperId,
}) => {
  const { t } = useTranslation();
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [libraryPapers, setLibraryPapers] = useState<Paper[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [importingFile, setImportingFile] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const toast = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [focusStep, setFocusStep] = useState<string | null>(null);

  // Analysis pipeline states
  const [steps, setSteps] = useState<Record<string, StepState>>({
    summary: { status: "pending", content: "" },
    critique: { status: "pending", content: "" },
    conflict: { status: "pending", content: "" },
    gap: { status: "pending", content: "" },
    debate: { status: "pending", content: "" },
  });

  // Per-step regeneration state
  const [regeneratingSteps, setRegeneratingSteps] = useState<Record<string, boolean>>({
    summary: false,
    critique: false,
    conflict: false,
    gap: false,
    debate: false,
  });
  const [regeneratingAll, setRegeneratingAll] = useState(false);

  const [activeStepMessage, setActiveStepMessage] = useState<Record<string, string>>({
    summary: t("wow.loader_summary_1"),
    critique: t("wow.loader_critique_1"),
    conflict: t("wow.loader_conflict_1"),
    gap: t("wow.loader_gap_1"),
    debate: t("wow.loader_debate_1"),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeAnalysisRunId = useRef<string | null>(null);
  const messageIntervals = useRef<Record<string, any>>({});

  // Load library papers for quick select
  useEffect(() => {
    loadLibrary();
  }, []);

  // Handle initialPaperId if passed from other views
  useEffect(() => {
    if (initialPaperId) {
      const paper = libraryPapers.find((p) => p.id === initialPaperId);
      if (paper) {
        handleSelectPaper(paper);
      } else {
        // Fetch paper by ID if not loaded in library list yet
        api.getPaper(initialPaperId).then((res) => {
          handleSelectPaper(res);
        }).catch(err => {
          console.error("Failed to load initial wow paper:", err);
        });
      }
      if (onClearInitialPaperId) onClearInitialPaperId();
    }
  }, [initialPaperId, libraryPapers]);

  // Handle auto-scrolling to the focused step once selectedPaper is active
  useEffect(() => {
    if (selectedPaper && focusStep) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`wow-section-${focusStep}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 600); // Wait for transition and loading animation to begin
      return () => clearTimeout(timer);
    }
  }, [selectedPaper, focusStep]);

  const handleActionClick = (stepKey: string) => {
    setFocusStep(stepKey);
    fileInputRef.current?.click();
  };

  const loadLibrary = async () => {
    setLoadingLibrary(true);
    try {
      const res = await api.listPapers(1, 1000, "indexed");
      setLibraryPapers(res.papers);
    } catch (e) {
      console.error("Failed to load library in WOW view:", e);
    } finally {
      setLoadingLibrary(false);
    }
  };

  // Start animated text changes for a step
  const startLoadingMessages = (stepKey: string) => {
    if (messageIntervals.current[stepKey]) {
      clearInterval(messageIntervals.current[stepKey]);
    }
    let idx = 0;
    const messages = LOADER_MESSAGES_KEYS[stepKey];
    setActiveStepMessage((prev) => ({ ...prev, [stepKey]: t(messages[0]) }));

    messageIntervals.current[stepKey] = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setActiveStepMessage((prev) => ({ ...prev, [stepKey]: t(messages[idx]) }));
    }, 2500);
  };

  const stopLoadingMessages = (stepKey: string) => {
    if (messageIntervals.current[stepKey]) {
      clearInterval(messageIntervals.current[stepKey]);
      delete messageIntervals.current[stepKey];
    }
  };

  // ── Central step prompts (shared by pipeline + regeneration) ─
  const STEP_PROMPTS: Record<string, string> = {
    summary: t("wow.prompt_summary"),
    critique: t("wow.prompt_critique"),
    conflict: t("wow.prompt_conflict"),
    gap: t("wow.prompt_gap"),
    debate: t("wow.prompt_debate"),
  };

  const runSingleStep = async (stepKey: string, paperId: string, runId: string) => {
    const prompt = STEP_PROMPTS[stepKey];
    if (!prompt) return;

    if (activeAnalysisRunId.current !== runId) return;

    setSteps((prev) => ({
      ...prev,
      [stepKey]: { ...(prev[stepKey] || { content: "" }), status: "running" },
    }));
    startLoadingMessages(stepKey);

    // Special case for summary: check auto_summary first
    if (stepKey === "summary") {
      try {
        const paper = await api.getPaper(paperId);
        if (activeAnalysisRunId.current !== runId) return;
        if (paper.auto_summary) {
    setSteps((prev) => ({
            ...prev,
            summary: { status: "completed", content: paper.auto_summary, modelUsed: "Auto-ingested" },
          }));
          stopLoadingMessages(stepKey);
          return;
        }
      } catch { /* ignore, fall back to chat */ }
    }

    try {
      const res = await api.chat(prompt, [paperId], "current", undefined, "fast");
      if (activeAnalysisRunId.current !== runId) return;
      setSteps((prev) => ({
        ...prev,
        [stepKey]: { status: "completed", content: res.answer, citations: res.citations, modelUsed: res.model_used },
      }));
    } catch (e: any) {
      if (activeAnalysisRunId.current !== runId) return;
      setSteps((prev) => ({
        ...prev,
        [stepKey]: { status: "error", content: "", error: e.message || t("wow.cannot_generate", { step: stepKey }) },
      }));
    }
    stopLoadingMessages(stepKey);
  };

  const handleRegenerateStep = async (stepKey: string) => {
    if (!selectedPaper) return;
    const subRunId = `regenerate-${stepKey}-${Date.now()}`;

    setRegeneratingSteps((prev) => ({ ...prev, [stepKey]: true }));

    // Reset the step to running
    setSteps((prev) => ({
      ...prev,
      [stepKey]: { status: "running", content: "" },
    }));

    await runSingleStep(stepKey, selectedPaper.id, subRunId);

    setRegeneratingSteps((prev) => ({ ...prev, [stepKey]: false }));
  };

  const handleRegenerateAll = async () => {
    if (!selectedPaper) return;
    setRegeneratingAll(true);

    // Reset all steps to running
    setSteps(() => ({
      summary: { status: "running", content: "" },
      critique: { status: "running", content: "" },
      conflict: { status: "running", content: "" },
      gap: { status: "running", content: "" },
      debate: { status: "running", content: "" },
    }));

    // Run all regenerations concurrently
    await Promise.all([
      handleRegenerateStep("summary"),
      handleRegenerateStep("critique"),
      handleRegenerateStep("conflict"),
      handleRegenerateStep("gap"),
      handleRegenerateStep("debate"),
    ]);

    setRegeneratingAll(false);
  };

  // Clear all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(messageIntervals.current).forEach((interval) => clearInterval(interval));
    };
  }, []);

  const waitForIndexed = async (paperId: string, runId: string) => {
    let attempts = 0;
    while (attempts < 60) {
      if (activeAnalysisRunId.current !== runId) return;
      const paper = await api.getPaper(paperId);
      if (paper.status === "indexed") return;
      if (paper.status === "failed") throw new Error(t("wow.index_failed"));
      await new Promise((r) => setTimeout(r, 1500));
      attempts++;
    }
    throw new Error(t("wow.index_timeout"));
  };

  const handleSelectPaper = (paper: Paper) => {
    setSelectedPaper(paper);
    triggerWowPipeline(paper.id);
  };

  const triggerWowPipeline = async (paperId: string) => {
    const runId = Math.random().toString();
    activeAnalysisRunId.current = runId;

    // Reset steps to pending
    const initialStepsState: Record<string, StepState> = {
      summary: { status: "pending", content: "" },
      critique: { status: "pending", content: "" },
      conflict: { status: "pending", content: "" },
      gap: { status: "pending", content: "" },
      debate: { status: "pending", content: "" },
    };
    setSteps(initialStepsState);

    // Chờ paper index xong trước khi chạy pipeline
    try {
      await waitForIndexed(paperId, runId);
    } catch (e: any) {
      const errMsg = e.message || t("wow.index_failed");
      setSteps(() => ({
        summary: { status: "error", content: "", error: errMsg },
        critique: { status: "error", content: "", error: errMsg },
        conflict: { status: "error", content: "", error: errMsg },
        gap: { status: "error", content: "", error: errMsg },
        debate: { status: "error", content: "", error: errMsg },
      }));
      return;
    }
    if (activeAnalysisRunId.current !== runId) return;

    // Run all steps concurrently using the shared runSingleStep function
    await Promise.all([
      runSingleStep("summary", paperId, runId),
      runSingleStep("critique", paperId, runId),
      runSingleStep("conflict", paperId, runId),
      runSingleStep("gap", paperId, runId),
      runSingleStep("debate", paperId, runId),
    ]);
  };

  // Drag & Drop Ingestion
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (files.length > 0) {
      await uploadAndAnalyze(files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (files.length > 0) {
      await uploadAndAnalyze(files[0]);
    }
    e.target.value = "";
  };

  const uploadAndAnalyze = async (file: File) => {
    setImportingFile(true);
    setImportProgress(t("wow.upload_analyze"));
    try {
      const res = await api.importPaper(file);
      setImportProgress(t("wow.vectorizing"));
      
      // Wait for the paper status to be indexed
      let isIndexed = false;
      let checkCount = 0;
      while (!isIndexed && checkCount < 30) {
        await new Promise((r) => setTimeout(r, 1500));
        const paper = await api.getPaper(res.paper_id);
        if (paper.status === "indexed") {
          isIndexed = true;
          setImportingFile(false);
          handleSelectPaper(paper);
          loadLibrary(); // reload sidebar/library list
          break;
        } else if (paper.status === "failed") {
          throw new Error(t("wow.extract_failed"));
        }
        checkCount++;
      }

      if (!isIndexed) {
        throw new Error(t("wow.extract_timeout"));
      }
    } catch (e: any) {
      toast.addToast("error", t("wow.toast_import_error", { msg: e.message || e }));
      setImportingFile(false);
    }
  };

  const stripMarkdown = (s: string) =>
    s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`(.+?)`/g, '$1');

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("###")) {
        return (
          <h4 key={i} className="wow-card-h4">
            {stripMarkdown(trimmed.replace(/^#+\s*/, ""))}
          </h4>
        );
      }
      if (trimmed.startsWith("##")) {
        return (
          <h3 key={i} className="wow-card-h3">
            {stripMarkdown(trimmed.replace(/^#+\s*/, ""))}
          </h3>
        );
      }
      if (trimmed.startsWith("* **") || trimmed.startsWith("- **") || trimmed.startsWith("**")) {
        const clean = trimmed.replace(/^[*+-]\s*/, "").replace(/\*\*/g, "");
        const parts = clean.split(":");
        const label = parts[0] || "";
        const value = parts.slice(1).join(":").trim();
        return (
          <div key={i} className="wow-card-item">
            <span className="wow-card-item-label">{label}:</span>
            <span className="wow-card-item-value">{value}</span>
          </div>
        );
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
        return (
          <li key={i} className="wow-card-bullet">
            {stripMarkdown(trimmed.replace(/^[-•*]\s*/, ""))}
          </li>
        );
      }
      if (/^\d+\.\s/.test(trimmed)) {
        return (
          <li key={i} className="wow-card-number">
            {stripMarkdown(trimmed.replace(/^\d+\.\s*/, ""))}
          </li>
        );
      }
      if (trimmed) {
        return <p key={i} className="wow-card-text">{stripMarkdown(trimmed)}</p>;
      }
      return null;
    });
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.addToast("success", t("wow.copied_to_clipboard"));
  };

  return (
    <div className="wow-view">
      {/* File Ingestion Overlay */}
      {importingFile && (
        <div className="wow-loading-overlay">
          <div className="wow-loading-card">
            <IconSpinner size={48} className="wow-spin" />
            <h3>{t("wow.processing_pdf")}</h3>
            <p>{importProgress}</p>
          </div>
        </div>
      )}

      {/* State 1: Choose Paper or Drop File */}
      {!selectedPaper ? (
        <div className="wow-landing">
          <div className="wow-hero">
            <h1 className="wow-title">
              <IconBrain size={36} className="icon-gradient" style={{ marginRight: 12 }} />
              {t("wow.hero_title")}
            </h1>
            <p className="wow-subtitle">
              {t("wow.hero_subtitle")}
            </p>
          </div>

          {/* Drag & Drop Zone */}
          <div
            className={`wow-dropzone ${dragOver ? "drag-over" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => {
              setFocusStep(null);
              fileInputRef.current?.click();
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".pdf"
              onChange={handleFileSelect}
            />
            <div className="wow-dropzone-icon">
              <IconUpload size={48} className="icon-gradient" />
            </div>
            <h2>{t("wow.dropzone_title")}</h2>
            <p>{t("wow.dropzone_text")}</p>
            <div className="wow-dropzone-badge">{t("wow.dropzone_badge")}</div>
          </div>

          {/* Action Buttons */}
          <div className="wow-action-buttons">
            <button className="wow-action-btn wow-action-summary" onClick={() => handleActionClick("summary")}>
              <span className="wow-action-icon"><IconFileText size={20} /></span>
              <span className="wow-action-label">{t("wow.action_summary")}</span>
            </button>
            <button className="wow-action-btn wow-action-critique" onClick={() => handleActionClick("critique")}>
              <span className="wow-action-icon"><IconWarning size={20} /></span>
              <span className="wow-action-label">{t("wow.action_critique")}</span>
            </button>
            <button className="wow-action-btn wow-action-debate" onClick={() => handleActionClick("debate")}>
              <span className="wow-action-icon"><IconSwords size={20} /></span>
              <span className="wow-action-label">{t("wow.action_compare")}</span>
            </button>
          </div>

          {/* Quick Selection from library */}
          <div className="wow-quick-select">
            <h3 className="wow-section-title">{t("wow.library_papers")}</h3>
            {loadingLibrary ? (
              <div className="wow-library-loading">
                <IconSpinner size={24} />
                <span>{t("wow.loading_papers")}</span>
              </div>
            ) : libraryPapers.length === 0 ? (
              <div className="wow-library-empty">
                <p>{t("wow.no_papers")}</p>
                <p className="wow-empty-hint">
                  <IconWithText icon={IconArrowDown} size={14}>{t("wow.hint_drop")}</IconWithText>
                </p>
              </div>
            ) : (
              <div className="wow-papers-grid">
                {libraryPapers.map((paper) => (
                  <button
                    key={paper.id}
                    className="wow-paper-card-select"
                    onClick={() => handleSelectPaper(paper)}
                  >
                    <div className="wow-paper-icon">
                      <IconFileText size={24} />
                    </div>
                    <div className="wow-paper-info">
                      <h4 className="wow-paper-title-text" title={paperDisplayTitle(paper.title, paper.filename)}>
                        {paperDisplayTitle(paper.title, paper.filename)}
                      </h4>
                      <p className="wow-paper-meta-text">
                        {paper.year ? `${paper.year} · ` : ""}
                        {paper.authors ? `${paper.authors.replace(/[\[\]"']/g, "").slice(0, 40)}...` : t("wow.unknown_author")}
                      </p>
                    </div>
                    <div className="wow-paper-hover-badge">
                      <IconWithText icon={IconZap} size={12}>WOW</IconWithText>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* State 2: Active WOW Pipeline Report */
        <div className="wow-report">
          {/* Header */}
          <header className="wow-report-header">
            <div className="wow-report-header-left">
              <button
                className="wow-back-btn"
                onClick={() => {
                  setSelectedPaper(null);
                  activeAnalysisRunId.current = null;
                  setFocusStep(null);
                }}
              >
                {t("wow.back")}
              </button>
              <h2 className="wow-report-paper-title">
                <IconFileText size={24} className="wow-doc-icon" />
                {paperDisplayTitle(selectedPaper.title, selectedPaper.filename)}
              </h2>
              <p className="wow-report-paper-meta">
                {selectedPaper.authors && (
                  <span>{t("wow.author_label", { authors: selectedPaper.authors.replace(/[\[\]"']/g, "") })} · </span>
                )}
                {selectedPaper.year && <span>{t("wow.year_label", { year: selectedPaper.year })} · </span>}
                <span>{t("wow.language_label", { lang: selectedPaper.language.toUpperCase() })} · </span>
                <span>{t("wow.pages_label", { n: selectedPaper.page_count || "?" })}</span>
              </p>
            </div>
            <div className="wow-report-header-right">
              <button
                className="wow-action-btn-header wow-regenerate-all-btn"
                onClick={handleRegenerateAll}
                disabled={regeneratingAll || Object.values(regeneratingSteps).some(Boolean)}
              >
                {regeneratingAll ? (
                  <><IconSpinner size={14} /> {t("wow.regenerating")}</>
                ) : (
                  <><IconRotateCcw size={14} /> {t("wow.regenerate_all")}</>
                )}
              </button>
              <button
                className="wow-action-btn-header"
                onClick={() => onStartChat([selectedPaper.id])}
              >
                <IconChat size={16} />
                <span>{t("wow.ask_ai")}</span>
              </button>
            </div>
          </header>

          {/* Stepper Status Bar */}
          <div className="wow-stepper">
            {WOW_STEPS.map((step, idx) => {
              const meta = WOW_STEP_META_FN(t)[step.key];
              const state = steps[step.key];
              return (
                <div
                  key={step.key}
                  className={`wow-step-indicator ${state.status}`}
                  onClick={() => {
                    const element = document.getElementById(`wow-section-${step.key}`);
                    element?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  title={t("wow.view_step", { label: meta.label })}
                >
                  <div className="wow-step-indicator-number">
                    {state.status === "completed" ? (
                      <IconCheck size={14} style={{ color: "#fff" }} />
                    ) : state.status === "running" ? (
                      <IconSpinner size={14} />
                    ) : state.status === "error" ? (
                      <IconError size={14} style={{ color: "#fff" }} />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className="wow-step-indicator-label">
                    <IconWithText icon={meta.Icon} size={13}>{meta.label}</IconWithText>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Stack of Cards (Sequential Report) */}
          <div className="wow-sections-stack">
            {/* Card 1: Summary */}
            <section
              id="wow-section-summary"
              className={`wow-card-section wow-theme-summary ${steps.summary.status} ${focusStep === "summary" ? "focused-highlight" : ""}`}
            >
              <header className="wow-card-header">
                <div className="wow-card-title">
                  <span className="wow-card-icon-badge"><IconSparkle size={16} /></span>
                  <h3>{t("wow.card_summary")}</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.summary.status === "running" && <span className="loader-span"><IconSpinner size={14} /> {t("wow.status_extracting")}</span>}
                  {steps.summary.status === "completed" && <span className="badge-done">{t("wow.status_completed")}</span>}
                  {steps.summary.status === "error" && <span className="badge-error">{t("wow.status_error")}</span>}
                  {steps.summary.status === "pending" && <span className="badge-pending">{t("wow.status_pending")}</span>}
                </div>
              </header>

              <div className="wow-card-body">
                {steps.summary.status === "running" && (
                  <div className="wow-card-loading-state">
                    <IconSpinner size={24} className="wow-spin" />
                    <p className="loading-msg">{activeStepMessage.summary}</p>
                  </div>
                )}
                {steps.summary.status === "completed" && (
                  <div className="wow-card-content-render animate-fade-in">
                    {renderMarkdown(steps.summary.content)}
                  </div>
                )}
                {steps.summary.status === "error" && (
                  <div className="wow-card-error-state">
                    <IconError size={20} />
                    <p>{steps.summary.error}</p>
                  </div>
                )}
                {steps.summary.status === "pending" && (
                  <div className="wow-card-pending-state">
                    <p>{t("wow.pending_click")}</p>
                  </div>
                )}
              </div>

              {steps.summary.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.summary.content)}
                  >
                    {t("wow.copy_summary")}
                  </button>
                  <button
                    className="wow-card-action-btn secondary"
                    onClick={() => handleRegenerateStep("summary")}
                    disabled={regeneratingSteps.summary}
                  >
                    {regeneratingSteps.summary ? (
                      <><IconSpinner size={13} /> {t("wow.generating")}</>
                    ) : (
                      <><IconRotateCcw size={14} /> {t("wow.regenerate")}</>
                    )}
                  </button>
                </footer>
              )}
            </section>

            {/* Card 2: Critique */}
            <section
              id="wow-section-critique"
              className={`wow-card-section wow-theme-critique ${steps.critique.status} ${focusStep === "critique" ? "focused-highlight" : ""}`}
            >
              <header className="wow-card-header">
                <div className="wow-card-title">
                  <span className="wow-card-icon-badge"><IconWarning size={16} /></span>
                  <h3>{t("wow.card_critique")}</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.critique.status === "running" && <span className="loader-span"><IconSpinner size={14} /> {t("wow.status_criticizing")}</span>}
                  {steps.critique.status === "completed" && <span className="badge-done">{t("wow.status_completed")}</span>}
                  {steps.critique.status === "error" && <span className="badge-error">{t("wow.status_error")}</span>}
                  {steps.critique.status === "pending" && <span className="badge-pending">{t("wow.status_pending")}</span>}
                </div>
              </header>

              <div className="wow-card-body">
                {steps.critique.status === "running" && (
                  <div className="wow-card-loading-state">
                    <IconSpinner size={24} className="wow-spin" />
                    <p className="loading-msg">{activeStepMessage.critique}</p>
                  </div>
                )}
                {steps.critique.status === "completed" && (
                  <div className="wow-card-content-render animate-fade-in">
                    {renderMarkdown(steps.critique.content)}
                  </div>
                )}
                {steps.critique.status === "error" && (
                  <div className="wow-card-error-state">
                    <IconError size={20} />
                    <p>{steps.critique.error}</p>
                  </div>
                )}
                {steps.critique.status === "pending" && (
                  <div className="wow-card-pending-state">
                    <p>{t("wow.pending_wait")}</p>
                  </div>
                )}
              </div>

              {steps.critique.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.critique.content)}
                  >
                    {t("wow.copy_critique")}
                  </button>
                  <button
                    className="wow-card-action-btn secondary"
                    onClick={() => handleRegenerateStep("critique")}
                    disabled={regeneratingSteps.critique}
                  >
                    {regeneratingSteps.critique ? (
                      <><IconSpinner size={13} /> {t("wow.generating")}</>
                    ) : (
                      <><IconRotateCcw size={14} /> {t("wow.regenerate")}</>
                    )}
                  </button>
                </footer>
              )}
            </section>

            {/* Card 3: Conflicts */}
            <section
              id="wow-section-conflict"
              className={`wow-card-section wow-theme-conflict ${steps.conflict.status}`}
            >
              <header className="wow-card-header">
                <div className="wow-card-title">
                  <span className="wow-card-icon-badge"><IconSwords size={16} /></span>
                  <h3>{t("wow.card_conflict")}</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.conflict.status === "running" && <span className="loader-span"><IconSpinner size={14} /> {t("wow.status_conflicting")}</span>}
                  {steps.conflict.status === "completed" && <span className="badge-done">{t("wow.status_completed")}</span>}
                  {steps.conflict.status === "error" && <span className="badge-error">{t("wow.status_error")}</span>}
                  {steps.conflict.status === "pending" && <span className="badge-pending">{t("wow.status_pending")}</span>}
                </div>
              </header>

              <div className="wow-card-body">
                {steps.conflict.status === "running" && (
                  <div className="wow-card-loading-state">
                    <IconSpinner size={24} className="wow-spin" />
                    <p className="loading-msg">{activeStepMessage.conflict}</p>
                  </div>
                )}
                {steps.conflict.status === "completed" && (
                  <div className="wow-card-content-render animate-fade-in">
                    {renderMarkdown(steps.conflict.content)}
                  </div>
                )}
                {steps.conflict.status === "error" && (
                  <div className="wow-card-error-state">
                    <IconError size={20} />
                    <p>{steps.conflict.error}</p>
                  </div>
                )}
                {steps.conflict.status === "pending" && (
                  <div className="wow-card-pending-state">
                    <p>{t("wow.pending_wait")}</p>
                  </div>
                )}
              </div>

              {steps.conflict.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.conflict.content)}
                  >
                    {t("wow.copy_conflict")}
                  </button>
                  <button
                    className="wow-card-action-btn secondary"
                    onClick={() => handleRegenerateStep("conflict")}
                    disabled={regeneratingSteps.conflict}
                  >
                    {regeneratingSteps.conflict ? (
                      <><IconSpinner size={13} /> {t("wow.generating")}</>
                    ) : (
                      <><IconRotateCcw size={14} /> {t("wow.regenerate")}</>
                    )}
                  </button>
                </footer>
              )}
            </section>

            {/* Card 4: Research Gap */}
            <section
              id="wow-section-gap"
              className={`wow-card-section wow-theme-gap ${steps.gap.status}`}
            >
              <header className="wow-card-header">
                <div className="wow-card-title">
                  <span className="wow-card-icon-badge"><IconCircleDot size={16} /></span>
                  <h3>{t("wow.card_gap")}</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.gap.status === "running" && <span className="loader-span"><IconSpinner size={14} /> {t("wow.status_gapping")}</span>}
                  {steps.gap.status === "completed" && <span className="badge-done">{t("wow.status_completed")}</span>}
                  {steps.gap.status === "error" && <span className="badge-error">{t("wow.status_error")}</span>}
                  {steps.gap.status === "pending" && <span className="badge-pending">{t("wow.status_pending")}</span>}
                </div>
              </header>

              <div className="wow-card-body">
                {steps.gap.status === "running" && (
                  <div className="wow-card-loading-state">
                    <IconSpinner size={24} className="wow-spin" />
                    <p className="loading-msg">{activeStepMessage.gap}</p>
                  </div>
                )}
                {steps.gap.status === "completed" && (
                  <div className="wow-card-content-render animate-fade-in">
                    {renderMarkdown(steps.gap.content)}
                  </div>
                )}
                {steps.gap.status === "error" && (
                  <div className="wow-card-error-state">
                    <IconError size={20} />
                    <p>{steps.gap.error}</p>
                  </div>
                )}
                {steps.gap.status === "pending" && (
                  <div className="wow-card-pending-state">
                    <p>{t("wow.pending_wait")}</p>
                  </div>
                )}
              </div>

              {steps.gap.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.gap.content)}
                  >
                    {t("wow.copy_gap")}
                  </button>
                  <button
                    className="wow-card-action-btn secondary"
                    onClick={() => handleRegenerateStep("gap")}
                    disabled={regeneratingSteps.gap}
                  >
                    {regeneratingSteps.gap ? (
                      <><IconSpinner size={13} /> {t("wow.generating")}</>
                    ) : (
                      <><IconRotateCcw size={14} /> {t("wow.regenerate")}</>
                    )}
                  </button>
                </footer>
              )}
            </section>

            {/* Card 5: Debate */}
            <section
              id="wow-section-debate"
              className={`wow-card-section wow-theme-debate ${steps.debate.status} ${focusStep === "debate" ? "focused-highlight" : ""}`}
            >
              <header className="wow-card-header">
                <div className="wow-card-title">
                  <span className="wow-card-icon-badge"><IconBrainAi size={16} /></span>
                  <h3>{t("wow.card_debate")}</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.debate.status === "running" && <span className="loader-span"><IconSpinner size={14} /> {t("wow.status_debating")}</span>}
                  {steps.debate.status === "completed" && <span className="badge-done">{t("wow.status_completed")}</span>}
                  {steps.debate.status === "error" && <span className="badge-error">{t("wow.status_error")}</span>}
                  {steps.debate.status === "pending" && <span className="badge-pending">{t("wow.status_pending")}</span>}
                </div>
              </header>

              <div className="wow-card-body">
                {steps.debate.status === "running" && (
                  <div className="wow-card-loading-state">
                    <IconSpinner size={24} className="wow-spin" />
                    <p className="loading-msg">{activeStepMessage.debate}</p>
                  </div>
                )}
                {steps.debate.status === "completed" && (
                  <div className="wow-card-content-render animate-fade-in">
                    {renderMarkdown(steps.debate.content)}
                  </div>
                )}
                {steps.debate.status === "error" && (
                  <div className="wow-card-error-state">
                    <IconError size={20} />
                    <p>{steps.debate.error}</p>
                  </div>
                )}
                {steps.debate.status === "pending" && (
                  <div className="wow-card-pending-state">
                    <p>{t("wow.pending_wait")}</p>
                  </div>
                )}
              </div>

              {steps.debate.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.debate.content)}
                  >
                    {t("wow.copy_debate")}
                  </button>
                  <button
                    className="wow-card-action-btn secondary"
                    onClick={() => handleRegenerateStep("debate")}
                    disabled={regeneratingSteps.debate}
                  >
                    {regeneratingSteps.debate ? (
                      <><IconSpinner size={13} /> {t("wow.generating")}</>
                    ) : (
                      <><IconRotateCcw size={14} /> {t("wow.regenerate")}</>
                    )}
                  </button>
                  {onStartDebate && (
                    <button
                      className="wow-card-action-btn primary"
                      onClick={() => onStartDebate([selectedPaper.id])}
                    >
                      {t("wow.expand_debate")}
                    </button>
                  )}
                </footer>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
