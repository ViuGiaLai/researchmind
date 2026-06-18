import React, { useState, useEffect, useRef } from "react";
import { api, Paper } from "../../lib/api";
import {
  IconSpinner,
  IconCheck,
  IconError,
  IconUpload,
  IconBrain,
  IconFileText,
  IconChat,
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

const LOADER_MESSAGES: Record<string, string[]> = {
  summary: [
    "Đang trích xuất nội dung bài báo...",
    "Đang xác định ý tưởng cốt lõi (Core Idea)...",
    "Đang phân tích các đóng góp chính (Contributions)...",
    "Đang tạo bản tóm tắt học thuật...",
  ],
  critique: [
    "Đang kiểm tra các giả thiết học thuật...",
    "Đang phân tích tính thực tiễn và bias của dữ liệu...",
    "Đang đánh giá các hạn chế phương pháp...",
    "Đang tìm kiếm nguy cơ overclaim...",
  ],
  conflict: [
    "Đang tìm kiếm các quan điểm đối lập...",
    "Đang so sánh phương pháp đo lường...",
    "Đang kiểm tra sự mâu thuẫn về kết luận...",
    "Đang phân tích khía cạnh đa chiều...",
  ],
  gap: [
    "Đang rà soát phần kiến nghị nghiên cứu...",
    "Đang tìm khoảng trống trong phương pháp...",
    "Đang xác định hướng phát triển tương lai...",
    "Đang tổng hợp cơ hội đóng góp mới...",
  ],
  debate: [
    "Đang thiết lập AI Persona A (Ủng hộ)...",
    "Đang thiết lập AI Persona B (Phản biện)...",
    "Đang tạo lập lập luận và phản biện...",
    "Đang đúc kết đề xuất kiểm chứng thực nghiệm...",
  ],
};

export const WowAnalysisView: React.FC<WowAnalysisViewProps> = ({
  onStartChat,
  onStartDebate,
  initialPaperId,
  onClearInitialPaperId,
}) => {
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

  const [activeStepMessage, setActiveStepMessage] = useState<Record<string, string>>({
    summary: LOADER_MESSAGES.summary[0],
    critique: LOADER_MESSAGES.critique[0],
    conflict: LOADER_MESSAGES.conflict[0],
    gap: LOADER_MESSAGES.gap[0],
    debate: LOADER_MESSAGES.debate[0],
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
      const res = await api.listPapers(1, 20, "indexed");
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
    const messages = LOADER_MESSAGES[stepKey];
    setActiveStepMessage((prev) => ({ ...prev, [stepKey]: messages[0] }));

    messageIntervals.current[stepKey] = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setActiveStepMessage((prev) => ({ ...prev, [stepKey]: messages[idx] }));
    }, 2500);
  };

  const stopLoadingMessages = (stepKey: string) => {
    if (messageIntervals.current[stepKey]) {
      clearInterval(messageIntervals.current[stepKey]);
      delete messageIntervals.current[stepKey];
    }
  };

  // Clear all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(messageIntervals.current).forEach((interval) => clearInterval(interval));
    };
  }, []);

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

    // 1. ✨ Tóm tắt ngay
    if (activeAnalysisRunId.current !== runId) return;
    setSteps((prev) => ({ ...prev, summary: { status: "running", content: "" } }));
    startLoadingMessages("summary");
    try {
      // Fetch fresh paper details to see if it has auto_summary
      const paper = await api.getPaper(paperId);
      if (activeAnalysisRunId.current === runId) {
        if (paper.auto_summary) {
          setSteps((prev) => ({
            ...prev,
            summary: { status: "completed", content: paper.auto_summary, modelUsed: "Auto-ingested" },
          }));
        } else {
          const res = await api.review("", [paperId]);
          setSteps((prev) => ({
            ...prev,
            summary: { status: "completed", content: res.answer, citations: res.citations, modelUsed: res.model_used },
          }));
        }
      }
    } catch (e: any) {
      if (activeAnalysisRunId.current === runId) {
        setSteps((prev) => ({
          ...prev,
          summary: { status: "error", content: "", error: e.message || "Không thể tạo tóm tắt" },
        }));
      }
    } finally {
      stopLoadingMessages("summary");
    }

    // 2. ⚠️ Điểm yếu (Critique)
    if (activeAnalysisRunId.current !== runId) return;
    setSteps((prev) => ({ ...prev, critique: { status: "running", content: "" } }));
    startLoadingMessages("critique");
    try {
      const res = await api.critique("", [paperId]);
      if (activeAnalysisRunId.current === runId) {
        setSteps((prev) => ({
          ...prev,
          critique: { status: "completed", content: res.answer, citations: res.citations, modelUsed: res.model_used },
        }));
      }
    } catch (e: any) {
      if (activeAnalysisRunId.current === runId) {
        setSteps((prev) => ({
          ...prev,
          critique: { status: "error", content: "", error: e.message || "Không thể phân tích phản biện" },
        }));
      }
    } finally {
      stopLoadingMessages("critique");
    }

    // 3. ⚔️ Mâu thuẫn (Conflict Analysis)
    if (activeAnalysisRunId.current !== runId) return;
    setSteps((prev) => ({ ...prev, conflict: { status: "running", content: "" } }));
    startLoadingMessages("conflict");
    try {
      const res = await api.findConflicts([paperId]);
      if (activeAnalysisRunId.current === runId) {
        setSteps((prev) => ({
          ...prev,
          conflict: { status: "completed", content: res.answer, citations: res.citations, modelUsed: res.model_used },
        }));
      }
    } catch (e: any) {
      if (activeAnalysisRunId.current === runId) {
        setSteps((prev) => ({
          ...prev,
          conflict: { status: "error", content: "", error: e.message || "Không thể phân tích mâu thuẫn" },
        }));
      }
    } finally {
      stopLoadingMessages("conflict");
    }

    // 4. 🕳️ Research Gap
    if (activeAnalysisRunId.current !== runId) return;
    setSteps((prev) => ({ ...prev, gap: { status: "running", content: "" } }));
    startLoadingMessages("gap");
    try {
      const res = await api.findResearchGap([paperId]);
      if (activeAnalysisRunId.current === runId) {
        setSteps((prev) => ({
          ...prev,
          gap: { status: "completed", content: res.answer, citations: res.citations, modelUsed: res.model_used },
        }));
      }
    } catch (e: any) {
      if (activeAnalysisRunId.current === runId) {
        setSteps((prev) => ({
          ...prev,
          gap: { status: "completed", content: "", error: e.message || "Không thể tìm khoảng trống nghiên cứu" },
        }));
      }
    } finally {
      stopLoadingMessages("gap");
    }

    // 5. 🧠 Tranh luận AI (Debate)
    if (activeAnalysisRunId.current !== runId) return;
    setSteps((prev) => ({ ...prev, debate: { status: "running", content: "" } }));
    startLoadingMessages("debate");
    try {
      const res = await api.debate("", [paperId]);
      if (activeAnalysisRunId.current === runId) {
        setSteps((prev) => ({
          ...prev,
          debate: { status: "completed", content: res.answer, citations: res.citations, modelUsed: res.model_used },
        }));
      }
    } catch (e: any) {
      if (activeAnalysisRunId.current === runId) {
        setSteps((prev) => ({
          ...prev,
          debate: { status: "error", content: "", error: e.message || "Không thể tạo cuộc tranh luận AI" },
        }));
      }
    } finally {
      stopLoadingMessages("debate");
    }
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
    setImportProgress("Đang tải lên và phân tích tài liệu...");
    try {
      const res = await api.importPaper(file);
      setImportProgress("Đang vector hóa văn bản (quá trình này mất vài giây)...");
      
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
          throw new Error("Quá trình trích xuất chỉ mục thất bại.");
        }
        checkCount++;
      }

      if (!isIndexed) {
        throw new Error("Tài liệu xử lý lâu hơn dự kiến. Vui lòng kiểm tra lại trong Thư viện.");
      }
    } catch (e: any) {
      toast.addToast("error", `Lỗi import: ${e.message || e}`);
      setImportingFile(false);
    }
  };

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("###")) {
        return (
          <h4 key={i} className="wow-card-h4">
            {trimmed.replace(/^#+\s*/, "")}
          </h4>
        );
      }
      if (trimmed.startsWith("##")) {
        return (
          <h3 key={i} className="wow-card-h3">
            {trimmed.replace(/^#+\s*/, "")}
          </h3>
        );
      }
      if (trimmed.startsWith("* **") || trimmed.startsWith("- **")) {
        const parts = trimmed.replace(/^[*+-]\s*/, "").split(":");
        const label = parts[0]?.replace(/\*\*/g, "") || "";
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
            {trimmed.replace(/^[-•*]\s*/, "")}
          </li>
        );
      }
      if (/^\d+\.\s/.test(trimmed)) {
        return (
          <li key={i} className="wow-card-number">
            {trimmed.replace(/^\d+\.\s*/, "")}
          </li>
        );
      }
      if (trimmed) {
        return <p key={i} className="wow-card-text">{trimmed}</p>;
      }
      return null;
    });
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.addToast("success", "Đã sao chép nội dung vào Clipboard!");
  };

  return (
    <div className="wow-view">
      {/* File Ingestion Overlay */}
      {importingFile && (
        <div className="wow-loading-overlay">
          <div className="wow-loading-card">
            <IconSpinner size={48} className="wow-spin" />
            <h3>Đang xử lý PDF của bạn</h3>
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
              Hiểu paper trong 10 giây
            </h1>
            <p className="wow-subtitle">
              AI phân tích tài liệu của bạn ngay lập tức
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
            <h2>Kéo thả file PDF vào đây</h2>
            <p>hoặc nhấn để duyệt file từ máy tính</p>
            <div className="wow-dropzone-badge">Hỗ trợ PDF</div>
          </div>

          {/* Action Buttons */}
          <div className="wow-action-buttons">
            <button className="wow-action-btn wow-action-summary" onClick={() => handleActionClick("summary")}>
              <span className="wow-action-icon">📄</span>
              <span className="wow-action-label">Tóm tắt ngay</span>
            </button>
            <button className="wow-action-btn wow-action-critique" onClick={() => handleActionClick("critique")}>
              <span className="wow-action-icon">⚠️</span>
              <span className="wow-action-label">Xem điểm yếu</span>
            </button>
            <button className="wow-action-btn wow-action-debate" onClick={() => handleActionClick("debate")}>
              <span className="wow-action-icon">⚔️</span>
              <span className="wow-action-label">So sánh</span>
            </button>
          </div>

          {/* Quick Selection from library */}
          <div className="wow-quick-select">
            <h3 className="wow-section-title">Hoặc chọn tài liệu từ thư viện của bạn</h3>
            {loadingLibrary ? (
              <div className="wow-library-loading">
                <IconSpinner size={24} />
                <span>Đang tải danh sách tài liệu...</span>
              </div>
            ) : libraryPapers.length === 0 ? (
              <div className="wow-library-empty">
                <p>Chưa có tài liệu</p>
                <p className="wow-empty-hint">👇 Kéo PDF vào để AI phân tích ngay</p>
              </div>
            ) : (
              <div className="wow-papers-grid">
                {libraryPapers.slice(0, 6).map((paper) => (
                  <button
                    key={paper.id}
                    className="wow-paper-card-select"
                    onClick={() => handleSelectPaper(paper)}
                  >
                    <div className="wow-paper-icon">
                      <IconFileText size={24} />
                    </div>
                    <div className="wow-paper-info">
                      <h4 className="wow-paper-title-text" title={paper.title || paper.filename}>
                        {paper.title || paper.filename}
                      </h4>
                      <p className="wow-paper-meta-text">
                        {paper.year ? `${paper.year} · ` : ""}
                        {paper.authors ? `${paper.authors.replace(/[\[\]"']/g, "").slice(0, 40)}...` : "Không rõ tác giả"}
                      </p>
                    </div>
                    <div className="wow-paper-hover-badge">⚡ WOW</div>
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
                ← Chọn tài liệu khác
              </button>
              <h2 className="wow-report-paper-title">
                <IconFileText size={24} className="wow-doc-icon" />
                {selectedPaper.title || selectedPaper.filename}
              </h2>
              <p className="wow-report-paper-meta">
                {selectedPaper.authors && (
                  <span>Tác giả: {selectedPaper.authors.replace(/[\[\]"']/g, "")} · </span>
                )}
                {selectedPaper.year && <span>Năm: {selectedPaper.year} · </span>}
                <span>Ngôn ngữ: {selectedPaper.language.toUpperCase()} · </span>
                <span>{selectedPaper.page_count || "?"} trang</span>
              </p>
            </div>
            <div className="wow-report-header-right">
              <button
                className="wow-action-btn-header"
                onClick={() => onStartChat([selectedPaper.id])}
              >
                <IconChat size={16} />
                <span>Hỏi AI về paper này</span>
              </button>
            </div>
          </header>

          {/* Stepper Status Bar */}
          <div className="wow-stepper">
            {[
              { key: "summary", label: "✨ Tóm tắt ngay", color: "#10b981" },
              { key: "critique", label: "⚠️ Điểm yếu", color: "#ef4444" },
              { key: "conflict", label: "⚔️ Mâu thuẫn", color: "#f59e0b" },
              { key: "gap", label: "🕳️ Research Gap", color: "#2dd4bf" },
              { key: "debate", label: "🧠 Tranh luận AI", color: "#06b6d4" },
            ].map((step, idx) => {
              const state = steps[step.key];
              return (
                <div
                  key={step.key}
                  className={`wow-step-indicator ${state.status}`}
                  onClick={() => {
                    const element = document.getElementById(`wow-section-${step.key}`);
                    element?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  title={`Xem phần ${step.label}`}
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
                  <span className="wow-step-indicator-label">{step.label}</span>
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
                  <span className="wow-card-icon-badge">✨</span>
                  <h3>Tóm tắt học thuật cực nhanh</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.summary.status === "running" && <span className="loader-span"><IconSpinner size={14} /> Đang trích xuất...</span>}
                  {steps.summary.status === "completed" && <span className="badge-done">Hoàn thành</span>}
                  {steps.summary.status === "error" && <span className="badge-error">Lỗi</span>}
                  {steps.summary.status === "pending" && <span className="badge-pending">Đang chờ</span>}
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
                    <p>Nhấp vào nút phân tích để bắt đầu tóm tắt</p>
                  </div>
                )}
              </div>

              {steps.summary.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.summary.content)}
                  >
                    Sao chép tóm tắt
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
                  <span className="wow-card-icon-badge">⚠️</span>
                  <h3>Điểm yếu & Hạn chế cốt lõi</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.critique.status === "running" && <span className="loader-span"><IconSpinner size={14} /> Đang phản biện...</span>}
                  {steps.critique.status === "completed" && <span className="badge-done">Hoàn thành</span>}
                  {steps.critique.status === "error" && <span className="badge-error">Lỗi</span>}
                  {steps.critique.status === "pending" && <span className="badge-pending">Đang chờ</span>}
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
                    <p>Chờ hoàn thành bước trước...</p>
                  </div>
                )}
              </div>

              {steps.critique.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.critique.content)}
                  >
                    Sao chép phản biện
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
                  <span className="wow-card-icon-badge">⚔️</span>
                  <h3>Mâu thuẫn & Tranh chấp khoa học</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.conflict.status === "running" && <span className="loader-span"><IconSpinner size={14} /> Đang tìm mâu thuẫn...</span>}
                  {steps.conflict.status === "completed" && <span className="badge-done">Hoàn thành</span>}
                  {steps.conflict.status === "error" && <span className="badge-error">Lỗi</span>}
                  {steps.conflict.status === "pending" && <span className="badge-pending">Đang chờ</span>}
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
                    <p>Chờ hoàn thành bước trước...</p>
                  </div>
                )}
              </div>

              {steps.conflict.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.conflict.content)}
                  >
                    Sao chép phân tích mâu thuẫn
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
                  <span className="wow-card-icon-badge">🕳️</span>
                  <h3>Lỗ hổng nghiên cứu (Research Gap)</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.gap.status === "running" && <span className="loader-span"><IconSpinner size={14} /> Đang tìm lỗ hổng...</span>}
                  {steps.gap.status === "completed" && <span className="badge-done">Hoàn thành</span>}
                  {steps.gap.status === "error" && <span className="badge-error">Lỗi</span>}
                  {steps.gap.status === "pending" && <span className="badge-pending">Đang chờ</span>}
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
                    <p>Chờ hoàn thành bước trước...</p>
                  </div>
                )}
              </div>

              {steps.gap.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.gap.content)}
                  >
                    Sao chép phân tích Research Gap
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
                  <span className="wow-card-icon-badge">🧠</span>
                  <h3>Tranh luận AI đa chiều & Đề xuất</h3>
                </div>
                <div className="wow-card-status-label">
                  {steps.debate.status === "running" && <span className="loader-span"><IconSpinner size={14} /> Đang tranh luận...</span>}
                  {steps.debate.status === "completed" && <span className="badge-done">Hoàn thành</span>}
                  {steps.debate.status === "error" && <span className="badge-error">Lỗi</span>}
                  {steps.debate.status === "pending" && <span className="badge-pending">Đang chờ</span>}
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
                    <p>Chờ hoàn thành bước trước...</p>
                  </div>
                )}
              </div>

              {steps.debate.status === "completed" && (
                <footer className="wow-card-footer">
                  <button
                    className="wow-card-action-btn"
                    onClick={() => handleCopyText(steps.debate.content)}
                  >
                    Sao chép cuộc tranh luận
                  </button>
                  {onStartDebate && (
                    <button
                      className="wow-card-action-btn primary"
                      onClick={() => onStartDebate([selectedPaper.id])}
                    >
                      Mở rộng tranh luận full-screen
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
