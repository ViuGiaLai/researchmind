import React, { useState, useRef, useEffect, useCallback } from "react";
import { api, ChatResponse, CitationEntry, VerifyResponse } from "../../lib/api";
import { VerifyPanel } from "./VerifyPanel";
import { parseDebate, ParsedDebate } from "../../lib/debateParser";
import {
  IconBrain,
  IconUser,
  IconTrash,
  IconSend,
  IconSpinner,
  IconBulb,
  IconFileText,
  IconStar,
  IconBook,
} from "../Icons";
import { OllamaErrorBanner } from "../shared/OllamaErrorBanner";
import { useToast } from "../shared/Toast";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: { source: string; page: number | null; text: string }[];
  model_used?: string;
}

type CitationStyle = "apa" | "ieee" | "vancouver";

const CITATION_STYLE_LABELS: Record<CitationStyle, string> = {
  apa: "APA 7th",
  ieee: "IEEE",
  vancouver: "Vancouver",
};

export const ChatView: React.FC<{
  initialPaperIds?: string[];
  initialQuery?: string;
  initialMode?: "chat" | "review" | "critique" | "debate" | "verify";
  stream?: boolean;
}> = ({ initialPaperIds, initialQuery, initialMode = "chat", stream = true }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [paperIds] = useState<string[]>(initialPaperIds || []);
  const [usage, setUsage] = useState<{
    used: number;
    limit: number;
    remaining: number;
    mode: string;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-cite state
  const [citeStyle, setCiteStyle] = useState<CitationStyle>("apa");
  const [citations, setCitations] = useState<CitationEntry[]>([]);
  const [bibliography, setBibliography] = useState("");
  const [citeLoading, setCiteLoading] = useState(false);
  const [showCitePanel, setShowCitePanel] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [exportingSynthesis, setExportingSynthesis] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadUsage();
  }, []);

  useEffect(() => {
    if (initialQuery && paperIds.length > 0) {
      let cancelled = false;
      setInput(initialQuery);
      const timer = setTimeout(() => {
        if (!cancelled) handleSend(initialQuery);
      }, 0);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, paperIds.join(",")]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const loadUsage = async () => {
    try {
      const u = await api.getChatUsage();
      setUsage(u);
    } catch (e) {
      console.error("Failed to load chat usage:", e);
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = overrideText?.trim() ?? input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      if (stream && initialMode === "chat") {
        const ids = paperIds.length > 0 ? paperIds : undefined;
        const streamCtrl = api.chatStream(text, ids);
        const assistantIdx = messages.length + 1;

        setMessages((prev) => [...prev, { role: "assistant", content: "🔍 Đang tra cứu tài liệu..." }]);
        setIsStreaming(true);

        let resolved = false;

        const finishWithError = (errMsg: string) => {
          if (resolved) return;
          resolved = true;
          setIsStreaming(false);
          setLoading(false);
          const isOllama = /ollama/i.test(errMsg) || /11434/i.test(errMsg);
          const content = `❌ Lỗi: ${errMsg}` + (isOllama ? "" : `\n\n> 💡 Đảm bảo FastAPI backend đang chạy: \`cd backend && uvicorn main:app --reload --port 8765\``);
          setMessages((prev) => prev.map((m, i) =>
            i === assistantIdx ? { ...m, content, model_used: isOllama ? "ollama_error" : undefined } : m
          ));
        };

        streamCtrl.onChunk = (chunk) => {
          setMessages((prev) => prev.map((m, i) => {
            if (i !== assistantIdx) return m;
            const current = m.content;
            if (current === "🔍 Đang tra cứu tài liệu...") {
              return { ...m, content: chunk };
            }
            return { ...m, content: current + chunk };
          }));
        };

        streamCtrl.onDone = (model, citations) => {
          if (resolved) return;
          resolved = true;
          setIsStreaming(false);
          setMessages((prev) => prev.map((m, i) =>
            i === assistantIdx ? { ...m, model_used: model, citations } : m
          ));
          loadUsage();
        };

        streamCtrl.onError = (err) => {
          if (resolved) return;
          resolved = true;
          setIsStreaming(false);
          finishWithError(err);
        };
      } else {
        let res: ChatResponse;
        if (initialMode === "review") {
          res = await api.review(
            text,
            paperIds.length > 0 ? paperIds : undefined,
          );
        } else if (initialMode === "critique") {
          res = await api.critique(
            text,
            paperIds.length > 0 ? paperIds : undefined,
          );
        } else if (initialMode === "debate") {
          res = await api.debate(
            text,
            paperIds.length > 0 ? paperIds : undefined,
          );
        } else if (initialMode === "verify") {
          if (stream) {
            const ids = paperIds.length > 0 ? paperIds : undefined;
            const streamCtrl = api.verifyStream(text, ids);
            const assistantIdx = messages.length + 1;

            setMessages((prev) => [...prev, { role: "assistant", content: "🔍 Đang tra cứu tài liệu..." }]);
            setIsStreaming(true);

            streamCtrl.onAcademic = (data, status) => {
              setVerifyResult({
                answer: "",
                citations: [],
                model_used: "",
                papers_used: [],
                external_sources: data,
                verify_status: status as "full" | "partial" | "local_only",
              });
            };

            streamCtrl.onChunk = (chunk) => {
              setMessages((prev) => prev.map((m, i) => {
                if (i !== assistantIdx) return m;
                const current = m.content;
                if (current === "🔍 Đang tra cứu tài liệu...") {
                  return { ...m, content: chunk };
                }
                return { ...m, content: current + chunk };
              }));
            };

            streamCtrl.onDone = (model, citations, externalSources, status) => {
              setIsStreaming(false);
              setVerifyResult({
                answer: messages[messages.length]?.content || "",
                citations,
                model_used: model,
                papers_used: [],
                external_sources: externalSources,
                verify_status: status as "full" | "partial" | "local_only",
              });
              setMessages((prev) => prev.map((m, i) =>
                i === assistantIdx ? { ...m, model_used: model, citations } : m
              ));
              loadUsage();
            };

            streamCtrl.onError = (err) => {
              setIsStreaming(false);
              const content = `❌ Lỗi: ${err}\n\n> 💡 Đảm bảo FastAPI backend đang chạy: \`cd backend && uvicorn main:app --reload --port 8765\``;
              setMessages((prev) => prev.map((m, i) =>
                i === assistantIdx ? { ...m, content } : m
              ));
            };

            // Early return — skip the non-streaming res assignment below
            return;
          } else {
            const vres = await api.verify(
              text,
              paperIds.length > 0 ? paperIds : undefined,
            );
            setVerifyResult(vres);
            res = {
              answer: vres.answer,
              citations: vres.citations,
              model_used: vres.model_used,
              papers_used: vres.papers_used,
              chunks_used: 0,
            };
          }
        } else {
          res = await api.chat(
            text,
            paperIds.length > 0 ? paperIds : undefined,
          );
        }
        const assistantMsg: Message = {
          role: "assistant",
          content: res.answer,
          citations: res.citations,
          model_used: res.model_used,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        loadUsage();
      }
    } catch (e) {
      const errorText = e instanceof Error ? e.message : "Không thể kết nối đến backend";
      const isOllamaError = /ollama/i.test(errorText) || /11434/i.test(errorText);
      let content = `❌ Lỗi: ${errorText}`;
      if (isOllamaError) {
        content = `❌ ${errorText}`;
      } else {
        content += `\n\n> 💡 Đảm bảo FastAPI backend đang chạy: \`cd backend && uvicorn main:app --reload --port 8765\``;
      }
      const errMsg: Message = {
        role: "assistant",
        content,
        model_used: isOllamaError ? "ollama_error" : undefined,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setCitations([]);
    setBibliography("");
    setShowCitePanel(false);
    setVerifyResult(null);
  };

  // ─── Auto-Cite Handlers ────────────────────────────────────

  const generateCitations = useCallback(async () => {
    const ids = paperIds.length > 0 ? paperIds : [];
    if (ids.length === 0) return;

    setCiteLoading(true);
    try {
      const res = await api.citePapers(ids, citeStyle);
      setCitations(res.citations);
      setBibliography(res.bibliography);
      setShowCitePanel(true);
    } catch (e) {
      console.error("Failed to generate citations:", e);
    } finally {
      setCiteLoading(false);
    }
  }, [paperIds, citeStyle]);

  const changeCiteStyle = useCallback(
    async (newStyle: CitationStyle) => {
      setCiteStyle(newStyle);
      if (showCitePanel && paperIds.length > 0) {
        setCiteLoading(true);
        try {
          const res = await api.citePapers(paperIds, newStyle);
          setCitations(res.citations);
          setBibliography(res.bibliography);
        } catch (e) {
          console.error("Failed to regenerate citations:", e);
        } finally {
          setCiteLoading(false);
        }
      }
    },
    [showCitePanel, paperIds],
  );

  const handleExportBibtex = useCallback(async () => {
    if (paperIds.length === 0) return;
    try {
      const res = await api.citePapers(paperIds, "bibtex");
      if (!res.bibliography) return;

      // Create a blob and trigger download
      const blob = new Blob([res.bibliography], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "researchmind-export.bib";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export BibTeX:", e);
    }
  }, [paperIds]);

  const triggerSynthesisExport = async (content: string, format: string) => {
    setExportingSynthesis(true);
    try {
      let title = "Synthesis_Report";
      if (initialMode === "review") {
        title = "Literature_Review_Report";
      } else if (initialMode === "critique") {
        title = "Paper_Critique_Report";
      } else if (initialMode === "debate") {
        title = "AI_Debate_Transcript";
      } else if (initialMode === "verify") {
        title = "Verification_Report";
      }
      
      const blob = await api.exportSynthesis(title, content, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}_${new Date().toISOString().slice(0, 10)}.${format === "md" ? "md" : format === "docx" ? "docx" : format === "pdf" ? "pdf" : "html"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export synthesis report:", e);
      toast.addToast("error", "❌ Xuất báo cáo thất bại. Vui lòng kiểm tra kết nối backend.");
    } finally {
      setExportingSynthesis(false);
    }
  };

  /** Export all assistant messages combined into a single synthesis document */
  const handleHeaderExport = async (format: string) => {
    const assistantMessages = messages.filter(m => m.role === "assistant" && m.content);
    if (assistantMessages.length === 0) return;

    const combinedContent = assistantMessages
      .map((msg, i) => {
        const header = i === 0 ? "# Synthesis Report" : `---\n## Phần ${i + 1}`;
        const modelInfo = msg.model_used ? `*Model: ${msg.model_used}*` : "";
        return `${header}\n${modelInfo}\n\n${msg.content}`;
      })
      .join("\n\n");

    await triggerSynthesisExport(combinedContent, format);
  };

  const copyToClipboard = useCallback(async (text: string, idx?: number) => {
    try {
      await navigator.clipboard.writeText(text);
      if (idx !== undefined) {
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 2000);
      } else {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      }
    } catch {
      // fallback: select + execCommand
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      if (idx !== undefined) {
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 2000);
      } else {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      }
    }
  }, []);

  const suggestedQuestions = [
    "Tóm tắt các paper trong thư viện",
    "So sánh phương pháp trong các paper đã chọn",
    "Những xu hướng nghiên cứu chính trong các paper này?",
  ];

  const formatContent = (text: string) => {
    return <MarkdownRenderer text={text} />;
  };

  const renderDebate = (text: string) => {
    const parsed: ParsedDebate = parseDebate(text);
    return (
      <div className="debate-container">
        <div className="debate-columns">
          <div className="debate-column debate-a">
            <h4>AI A (Ủng hộ)</h4>
            {parsed.aiA?.main && (
              <div className="debate-item">
                <strong>Luận điểm:</strong> {parsed.aiA.main}
              </div>
            )}
            {parsed.aiA?.rebuttal && (
              <div className="debate-item">
                <strong>Phản biện:</strong> {parsed.aiA.rebuttal}
              </div>
            )}
            {parsed.aiA?.citations &&
              parsed.aiA.citations.length > 0 && (
                <div className="debate-citations">
                  {parsed.aiA.citations.map((c, i) => (
                    <div key={i}>
                      📚 {c.source}
                      {c.page ? `, trang ${c.page}` : ""}
                    </div>
                  ))}
                </div>
              )}
          </div>

          <div className="debate-column debate-b">
            <h4>AI B (Phản biện)</h4>
            {parsed.aiB?.main && (
              <div className="debate-item">
                <strong>Luận điểm:</strong> {parsed.aiB.main}
              </div>
            )}
            {parsed.aiB?.rebuttal && (
              <div className="debate-item">
                <strong>Phản biện:</strong> {parsed.aiB.rebuttal}
              </div>
            )}
            {parsed.aiB?.citations &&
              parsed.aiB.citations.length > 0 && (
                <div className="debate-citations">
                  {parsed.aiB.citations.map((c, i) => (
                    <div key={i}>
                      📚 {c.source}
                      {c.page ? `, trang ${c.page}` : ""}
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {parsed.conclusion && (
          <div className="debate-conclusion">
            <h4>Kết luận</h4>
            <div>{parsed.conclusion}</div>
          </div>
        )}

        {parsed.suggestions && parsed.suggestions.length > 0 && (
          <div className="debate-suggestions">
            <h4>3 Đề xuất</h4>
            <ol>
              {parsed.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="chat-view">
      <div className="chat-view-header">
        <h2 className="chat-view-title">
          <IconBrain
            size={22}
            className="icon-gradient"
            style={{ verticalAlign: "middle", marginRight: 8 }}
          />
          Chat với Paper
        </h2>
        <div className="chat-view-header-actions">
          {/* Auto-Cite button */}
          {paperIds.length > 0 && (
            <button
              className="chat-view-cite-btn"
              onClick={generateCitations}
              disabled={citeLoading}
              title="Tạo citation từ papers đã chọn"
            >
              {citeLoading ? (
                <IconSpinner size={14} />
              ) : (
                <IconStar size={14} />
              )}
              📝 Citation
            </button>
          )}
          {/* Export buttons in header — prominent position */}
          {messages.filter(m => m.role === "assistant").length > 0 && (
            <div className="chat-view-export-group">
              <button
                className="chat-view-export-btn"
                onClick={() => handleHeaderExport("md")}
                disabled={exportingSynthesis}
                title="Tải báo cáo Markdown"
              >
                {exportingSynthesis ? <IconSpinner size={11} /> : <IconFileText size={13} />}
                Markdown
              </button>
              <button
                className="chat-view-export-btn"
                onClick={() => handleHeaderExport("docx")}
                disabled={exportingSynthesis}
                title="Tải báo cáo Word"
              >
                {exportingSynthesis ? <IconSpinner size={11} /> : <IconFileText size={13} />}
                Word
              </button>
              <button
                className="chat-view-export-btn"
                onClick={() => handleHeaderExport("html")}
                disabled={exportingSynthesis}
                title="Tải báo cáo HTML"
              >
                {exportingSynthesis ? <IconSpinner size={11} /> : <IconFileText size={13} />}
                HTML
              </button>
              <button
                className="chat-view-export-btn chat-view-export-btn-pdf"
                onClick={() => handleHeaderExport("pdf")}
                disabled={exportingSynthesis}
                title="Tải báo cáo PDF"
              >
                {exportingSynthesis ? <IconSpinner size={11} /> : <IconFileText size={13} />}
                PDF
              </button>
            </div>
          )}
          {usage && usage.mode === "cloud_free" && (
            <span
              className="chat-view-papers-badge"
              style={{
                background: "rgba(99, 102, 241, 0.08)",
                color: "var(--color-primary, #6366f1)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
              }}
            >
              ⚡ Free Cloud: {usage.used}/{usage.limit} câu
            </span>
          )}
          {paperIds.length > 0 && (
            <span className="chat-view-papers-badge">
              <IconFileText size={14} /> {paperIds.length} papers
            </span>
          )}
          {initialMode === "review" && (
            <span
              className="chat-view-papers-badge"
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                color: "var(--color-success, #10b981)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              ✅ Review tự động
            </span>
          )}
          {initialMode === "verify" && (
            <span
              className="chat-view-papers-badge"
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                color: "var(--color-warning, #f59e0b)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
              }}
            >
              🔍 Xác thực nghiên cứu
            </span>
          )}
          {messages.length > 0 && (
            <button className="chat-view-clear-btn" onClick={clearChat}>
              <IconTrash size={16} /> Xoá
            </button>
          )}
        </div>
      </div>

      <div className="chat-view-messages" ref={listRef}>
        {messages.length === 0 && !showCitePanel && (
          <div className="chat-view-empty">
            <IconBrain size={56} className="icon-gradient" />
            <h3>Hỏi về research của bạn</h3>
            <p>
              Chọn paper trong thư viện hoặc hỏi tất cả. AI sẽ trả lời có
              trích dẫn nguồn.
            </p>
            <div className="chat-view-suggestions">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  className="chat-view-suggestion-btn"
                  onClick={() => {
                    setInput(q);
                  }}
                >
                  <IconBulb size={14} style={{ marginRight: 4 }} />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Citation Panel ──────────────────────────────────── */}
        {showCitePanel && citations.length > 0 && (
          <div className="cite-panel">
            <div className="cite-panel-header">
              <div className="cite-panel-title">
                <IconBook size={18} />
                <span>Bibliography ({CITATION_STYLE_LABELS[citeStyle]})</span>
              </div>
              <div className="cite-panel-actions">
                <div className="cite-style-selector">
                  {(
                    Object.keys(CITATION_STYLE_LABELS) as CitationStyle[]
                  ).map((style) => (
                    <button
                      key={style}
                      className={`cite-style-btn ${citeStyle === style ? "active" : ""}`}
                      onClick={() => changeCiteStyle(style)}
                    >
                      {CITATION_STYLE_LABELS[style]}
                    </button>
                  ))}
                </div>
                <button
                  className="cite-copy-all-btn"
                  onClick={() => copyToClipboard(bibliography)}
                >
                  {copiedAll ? "✓ Đã copy" : "📋 Copy tất cả"}
                </button>
                <button
                  className="cite-export-bib-btn"
                  onClick={handleExportBibtex}
                  title="Export BibTeX (.bib)"
                >
                  📥 .bib
                </button>
                <button
                  className="cite-close-btn"
                  onClick={() => setShowCitePanel(false)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="cite-panel-list">
              {citations.map((c, i) => (
                <div key={c.paper_id || i} className="cite-item">
                  <div className="cite-item-number">[{i + 1}]</div>
                  <div className="cite-item-content">
                    <div
                      className="cite-item-formatted"
                      dangerouslySetInnerHTML={{
                        __html: c.formatted.replace(
                          /\*(.+?)\*/g,
                          "<em>$1</em>",
                        ),
                      }}
                    />
                    <div className="cite-item-meta">
                      {c.authors.slice(0, 3).join(", ")}
                      {c.authors.length > 3 ? " et al." : ""}
                      {c.doi && (
                        <a
                          className="cite-item-doi"
                          href={`https://doi.org/${c.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          DOI ↗
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    className="cite-copy-btn"
                    onClick={() => copyToClipboard(c.formatted, i)}
                    title="Copy citation"
                  >
                    {copiedIdx === i ? "✓" : "📋"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Chat Messages ───────────────────────────────────── */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-view-msg ${msg.role === "user" ? "msg-user" : "msg-assistant"}`}
          >
            <div className="chat-view-avatar">
              {msg.role === "user" ? (
                <IconUser size={18} />
              ) : (
                <IconBrain size={18} />
              )}
            </div>
            <div className="chat-view-bubble">
              {initialMode === "debate" && msg.role === "assistant" ? (
                renderDebate(msg.content)
              ) : msg.role === "assistant" && msg.model_used === "ollama_error" ? (
                <div style={{ padding: "8px 0" }}>
                  <OllamaErrorBanner
                    title={msg.content.replace(/^❌ /, "")}
                    onRetry={() => handleSend(input || undefined)}
                    showDocLink
                  />
                </div>
              ) : (
                  <>
                    <div className="chat-view-text">
                      {formatContent(msg.content)}
                      {isStreaming && i === messages.length - 1 && (
                        <span className="streaming-cursor">|</span>
                      )}
                    </div>
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="chat-view-citations">
                        <strong>📚 Nguồn:</strong>
                        {msg.citations.map((c, j) => (
                          <span key={j} className="chat-view-citation">
                            [{c.source}]
                            {c.page ? ` (trang ${c.page})` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
              )}

              {initialMode === "verify" && verifyResult && i === messages.length - 1 && msg.role === "assistant" && (
                <VerifyPanel
                  sources={verifyResult.external_sources}
                  status={verifyResult.verify_status}
                />
              )}

              {msg.role === "assistant" && msg.model_used !== "ollama_error" && (
                <div className="chat-view-model-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "8px", fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)" }}>
                  <div>{msg.model_used ? `🤖 ${msg.model_used}` : "🤖 Assistant"}</div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => copyToClipboard(msg.content)}
                      style={{ background: "transparent", border: "none", color: "var(--color-text-muted, #94a3b8)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      title="Sao chép nội dung"
                    >
                      📋 Sao chép
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-view-msg msg-assistant">
            <div className="chat-view-avatar">
              <IconBrain size={18} />
            </div>
            <div className="chat-view-bubble">
              <div className="chat-typing">
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-view-input">
        <textarea
          className="chat-view-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Hỏi về research của bạn..."
          rows={2}
          disabled={loading}
        />
        <button
          className="chat-view-send-btn"
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
        >
          {loading ? <IconSpinner size={20} /> : <IconSend size={20} />}
        </button>
      </div>
    </div>
  );
};
