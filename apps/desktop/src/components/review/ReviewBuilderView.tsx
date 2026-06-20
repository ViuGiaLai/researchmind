import { useState, useEffect } from "react";
import { api, ReviewSection } from "../../lib/api";
import { ReviewSectionEditor } from "./ReviewSectionEditor";
import { useToast } from "../shared/Toast";
import {
  IconBookOpen,
  IconFileText,
  IconCheck,
  IconChart,
  IconDownload,
  IconSpinner,
} from "../Icons";

const REVIEW_SECTIONS = [
  { key: "background", label: "1. Background" },
  { key: "related_work", label: "2. Related Work" },
  { key: "methodology_comparison", label: "3. Methodology Comparison" },
  { key: "findings", label: "4. Findings" },
  { key: "limitations", label: "5. Limitations" },
  { key: "research_gaps", label: "6. Research Gaps" },
  { key: "future_directions", label: "7. Future Directions" },
  { key: "bibliography", label: "8. Bibliography" },
];

export function ReviewBuilderView() {
  const [papers, setPapers] = useState<{ id: string; title: string; authors: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("Literature Review");
  const [step, setStep] = useState<"select" | "review">("select");
  const [sections, setSections] = useState<Record<string, ReviewSection>>({});
  const [fullText, setFullText] = useState("");
  const [paperTitles, setPaperTitles] = useState<string[]>([]);
  const [generatingSections, setGeneratingSections] = useState<Set<string>>(new Set());
  const [generatingAll, setGeneratingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const [matrix, setMatrix] = useState<{ columns: string[]; rows: string[][] } | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

  useEffect(() => {
    loadPapers();
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

  const handleGenerateDraft = async () => {
    if (selectedIds.length === 0) {
      toast.addToast("error", "Vui lòng chọn ít nhất 1 tài liệu.");
      return;
    }

    setGeneratingAll(true);
    setStep("review");
    setSections({});
    setFullText("");
    setGeneratingSections(new Set(REVIEW_SECTIONS.map((s) => s.key)));

    try {
      api.generateReviewDraftStream(selectedIds, title, undefined, {
        onStart: (payload) => {
          setPaperTitles(payload.paper_titles || []);
        },
        onSection: (section) => {
          setSections((prev) => {
            const next = { ...prev, [section.section]: section };
            setFullText(rebuildFullText(title, next));
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
        },
        onError: (error) => {
          toast.addToast("error", error);
          setGeneratingAll(false);
          setGeneratingSections(new Set());
          setStep("select");
        },
      });
    } catch (e) {
      toast.addToast("error", "Lỗi khi tạo draft: " + (e instanceof Error ? e.message : String(e)));
      setStep("select");
      setGeneratingAll(false);
      setGeneratingSections(new Set());
    }
  };

  const handleRegenerateSection = async (sectionKey: string) => {
    setGeneratingSections((prev) => new Set(prev).add(sectionKey));
    try {
      const res = await api.generateReviewSection(selectedIds, sectionKey);
      if (res.error) {
        toast.addToast("error", res.error);
        return;
      }
      setSections((prev) => ({ ...prev, [sectionKey]: res }));
      setFullText(rebuildFullText(title, { ...sections, [sectionKey]: res }));
    } catch (e) {
      toast.addToast("error", "Lỗi khi tạo lại section: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGeneratingSections((prev) => {
        const next = new Set(prev);
        next.delete(sectionKey);
        return next;
      });
    }
  };

  const handleSectionEdit = (sectionKey: string, content: string) => {
    const updated = { ...sections[sectionKey], content };
    setSections((prev) => ({ ...prev, [sectionKey]: updated }));
    setFullText(rebuildFullText(title, { ...sections, [sectionKey]: updated }));
  };

  const rebuildFullText = (reviewTitle: string, sectionMap: Record<string, ReviewSection>) => {
    const parts = [`# ${reviewTitle}\n`];
    for (const { key } of REVIEW_SECTIONS) {
      const s = sectionMap[key];
      if (s && s.content) {
        parts.push(`\n## ${s.title}\n\n${s.content}\n`);
      }
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
      setMatrix(res.matrix);
    } catch (e) {
      toast.addToast("error", "Lỗi khi tạo ma trận: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setMatrixLoading(false);
    }
  };

  const handleExport = async (format: string) => {
    setExporting(true);
    try {
      const content = fullText || rebuildFullText(title, sections);
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

  return (
    <div className="review-builder" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--color-border, rgba(148, 163, 184, 0.15))",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <IconBookOpen size={22} className="icon-gradient" />
        <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>Literature Review Builder</span>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
        {step === "select" ? (
          <>
            <div
              style={{
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: "block", fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", marginBottom: 4 }}>
                  Tiêu đề Literature Review
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--color-border, rgba(148, 163, 184, 0.2))",
                    background: "var(--color-bg, rgba(0,0,0,0.05))",
                    color: "var(--color-text, #e2e8f0)",
                    fontSize: "0.85rem",
                  }}
                  placeholder="Nhập tiêu đề..."
                />
              </div>
              <div style={{ display: "flex", gap: 6, alignSelf: "flex-end" }}>
                <button
                  onClick={selectAllFiltered}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    background: "transparent",
                    color: "var(--color-text-muted, #94a3b8)",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                  }}
                >
                  Chọn tất cả
                </button>
                <button
                  onClick={deselectAll}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    background: "transparent",
                    color: "var(--color-text-muted, #94a3b8)",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                  }}
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 16,
                maxHeight: 300,
                overflow: "auto",
                padding: 4,
              }}
            >
              {papers.map((p) => {
                const selected = selectedIds.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => togglePaper(p.id)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1px solid ${selected ? "var(--color-primary, #6366f1)" : "var(--color-border, rgba(148, 163, 184, 0.15))"}`,
                      background: selected ? "rgba(99, 102, 241, 0.08)" : "var(--color-surface, rgba(255, 255, 255, 0.02))",
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      color: selected ? "var(--color-primary, #6366f1)" : "var(--color-text, #e2e8f0)",
                      transition: "all 0.15s",
                      userSelect: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {selected ? (
                      <IconCheck size={14} style={{ color: "var(--color-primary, #6366f1)" }} />
                    ) : (
                      <IconFileText size={14} />
                    )}
                    {p.title}
                  </div>
                );
              })}
              {papers.length === 0 && (
                <div style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: "0.85rem", padding: 20 }}>
                  Chưa có tài liệu nào trong thư viện. Vui lòng import tài liệu trước.
                </div>
              )}
            </div>

            {selectedIds.length > 0 && (
              <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)", marginBottom: 12 }}>
                Đã chọn <strong>{selectedIds.length}</strong> tài liệu
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleGenerateDraft}
                disabled={selectedIds.length === 0 || generatingAll}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--color-primary, #6366f1)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  opacity: selectedIds.length === 0 || generatingAll ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {generatingAll ? (
                  <IconSpinner size={16} />
                ) : (
                  <IconBookOpen size={16} />
                )}
                {generatingAll ? "Đang tạo draft..." : "Tạo Literature Review"}
              </button>
              <button
                onClick={handleGenerateMatrix}
                disabled={selectedIds.length < 2 || matrixLoading}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "1px solid var(--color-primary, #6366f1)",
                  background: "transparent",
                  color: "var(--color-primary, #6366f1)",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  opacity: selectedIds.length < 2 || matrixLoading ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {matrixLoading ? (
                  <IconSpinner size={16} />
                ) : (
                  <IconChart size={16} />
                )}
                {matrixLoading ? "Đang tạo..." : "Tạo ma trận so sánh"}
              </button>
            </div>

            {matrix && (
              <div
                style={{
                  marginTop: 20,
                  padding: 16,
                  borderRadius: 8,
                  border: "1px solid var(--color-border, rgba(148, 163, 184, 0.15))",
                  overflow: "auto",
                }}
              >
                <h3 style={{ margin: "0 0 12px", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 8 }}>
                  <IconChart size={18} className="icon-gradient" />
                  Ma trận so sánh tài liệu
                </h3>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.8rem",
                  }}
                >
                  <thead>
                    <tr>
                      {matrix.columns.map((col, i) => (
                        <th
                          key={i}
                          style={{
                            padding: "8px 10px",
                            textAlign: "left",
                            borderBottom: "2px solid var(--color-primary, #6366f1)",
                            color: "var(--color-primary, #6366f1)",
                            fontWeight: 600,
                            fontSize: "0.78rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            style={{
                              padding: "8px 10px",
                              borderBottom: "1px solid var(--color-border, rgba(148, 163, 184, 0.1))",
                              fontSize: "0.78rem",
                              color: j === 0 ? "var(--color-primary, #6366f1)" : "var(--color-text, #e2e8f0)",
                              fontWeight: j === 0 ? 600 : 400,
                              verticalAlign: "top",
                            }}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div>
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
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setStep("select")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    background: "transparent",
                    color: "var(--color-text-muted, #94a3b8)",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  ← Chọn lại
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              {REVIEW_SECTIONS.map(({ key, label }) => (
                <ReviewSectionEditor
                  key={key}
                  section={key}
                  title={label}
                  content={sections[key]?.content || ""}
                  loading={generatingSections.has(key)}
                  onRegenerate={handleRegenerateSection}
                  onChange={handleSectionEdit}
                />
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "12px 0",
                borderTop: "1px solid var(--color-border, rgba(148, 163, 184, 0.1))",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--color-text-muted, #94a3b8)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginRight: 8,
                }}
              >
                <IconDownload size={16} />
                Xuất báo cáo:
              </span>
              {["markdown", "html", "docx"].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => handleExport(fmt)}
                  disabled={exporting}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid var(--color-primary, #6366f1)",
                    background: "transparent",
                    color: "var(--color-primary, #6366f1)",
                    cursor: exporting ? "not-allowed" : "pointer",
                    fontSize: "0.82rem",
                    fontWeight: 500,
                    opacity: exporting ? 0.5 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
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
    </div>
  );
}
