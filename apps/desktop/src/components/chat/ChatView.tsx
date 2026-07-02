import React, { useState, useRef, useEffect, useCallback } from "react";
import { api, BASE_URL, ChatResponse, CitationEntry, Collection, VerifyResponse } from "../../lib/api";
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
  IconLibrary,
  IconSearch,
  IconZap,
  IconCheck,
  IconDownload,
  IconClose,
} from "../Icons";

import { useToast } from "../shared/Toast";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface CitationInfo {
  source: string;
  page: number | null;
  text: string;
  ref_id?: number;
  paper_id?: string;
  paper_title?: string;
  text_snippet?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: CitationInfo[];
  model_used?: string;
  router_reason?: string;
  token_count?: number;
}

type Scope = "current" | "library" | "collection" | "external";
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
  onGoToLibrary?: () => void;
}> = ({ initialPaperIds, initialQuery, initialMode = "chat", stream = true, onGoToLibrary }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [paperIds, setPaperIds] = useState<string[]>(initialPaperIds || []);
  const [paperTitles, setPaperTitles] = useState<Map<string, string>>(new Map());
  const [availablePapers, setAvailablePapers] = useState<{ id: string; title: string; authors: string }[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [usage, setUsage] = useState<{
    used: number;
    limit: number;
    remaining: number;
    mode: string;
  } | null>(null);
  void usage;
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const questionsCacheRef = useRef<Map<string, string[]>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const activeChatStreamRef = useRef<{ abort: () => void } | null>(null);
  const questionsAbortRef = useRef<AbortController | null>(null);

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
  const [scope, setScope] = useState<Scope>("current");
  const [reasoningMode, setReasoningMode] = useState<"fast" | "deep" | "deep+">("fast");
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState("");
  const [showPaperPicker, setShowPaperPicker] = useState(false);
  const [paperSearch, setPaperSearch] = useState("");
  const [tempPaperIds, setTempPaperIds] = useState<string[]>([]);
  const paperSearchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfPaperUrl, setPdfPaperUrl] = useState<string | null>(null);

  useEffect(() => {
    api.listCollections().then((res) => {
      setCollections(res.collections);
      if (!activeCollectionId && res.collections.length > 0) {
        setActiveCollectionId(res.collections[0].id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (paperIds.length === 1) {
      setPdfPaperUrl(`${BASE_URL}/api/papers/${paperIds[0]}/file`);
      setShowPdfViewer(true);
    } else {
      setPdfPaperUrl(null);
      setShowPdfViewer(false);
    }
  }, [paperIds]);

  const handlePasteHighlight = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setInput((prev) => {
          const quote = `> "${text.trim()}"\n\n`;
          return prev ? prev + quote : quote;
        });
        toast.addToast("success", "📋 Đã trích dẫn văn bản từ PDF/clipboard!");
      } else {
        toast.addToast("error", "❌ Clipboard trống hoặc không chứa văn bản.");
      }
    } catch (err) {
      toast.addToast("error", "❌ Không thể đọc clipboard. Vui lòng cấp quyền.");
    }
  };

  const openPaperPicker = () => {
    setTempPaperIds([...paperIds]);
    setPaperSearch("");
    setShowPaperPicker(true);
  };

  // Fetch paper titles for display
  useEffect(() => {
    if (paperIds.length === 0) {
      setPaperTitles(new Map());
      return;
    }
    let cancelled = false;
    Promise.all(paperIds.map(id =>
      api.getPaper(id).then(p => ({ id, title: p.title })).catch(() => null)
    )).then(results => {
      if (cancelled) return;
      const map = new Map<string, string>();
      results.forEach(r => { if (r) map.set(r.id, r.title); });
      setPaperTitles(map);
    });
    return () => { cancelled = true; };
  }, [paperIds.join(",")]);

  // Focus search input when modal opens; close on Escape
  useEffect(() => {
    if (showPaperPicker) {
      paperSearchRef.current?.focus();
    }
  }, [showPaperPicker]);

  useEffect(() => {
    if (!showPaperPicker) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPaperPicker(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showPaperPicker]);

  // Fetch available papers for inline selection
  useEffect(() => {
    if (scope !== "current" || paperIds.length > 0) {
      setAvailablePapers([]);
      setLoadingPapers(false);
      return;
    }
    let cancelled = false;
    setLoadingPapers(true);
    api.listPapers(1, 100)
      .then(data => {
        if (cancelled) return;
        setAvailablePapers(data.papers.map(p => ({
          id: p.id,
          title: p.title || p.filename,
          authors: p.authors || "",
        })));
      })
      .catch(() => { if (!cancelled) setAvailablePapers([]); })
      .finally(() => { if (!cancelled) setLoadingPapers(false); });
    return () => { cancelled = true; };
  }, [scope, paperIds.join(",")]);

  useEffect(() => {
    loadUsage();
  }, []);

  const initialQuerySent = useRef(false);

  useEffect(() => {
    if (initialQuery && paperIds.length > 0 && !initialQuerySent.current) {
      initialQuerySent.current = true;
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
    if (listRef.current && isNearBottomRef.current) {
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

  const getScopeKey = useCallback(() => {
    if (scope === "external") return "external";
    if (scope === "collection") return `collection:${activeCollectionId}`;
    if (scope === "current") return `current:${paperIds.sort().join(",")}`;
    return `library`;
  }, [scope, paperIds, activeCollectionId]);

  const fetchSuggestedQuestions = useCallback(async () => {
    questionsAbortRef.current?.abort();
    const controller = new AbortController();
    questionsAbortRef.current = controller;
    const key = getScopeKey();

    // Dùng cache nếu có
    const cached = questionsCacheRef.current.get(key);
    if (cached) {
      setSuggestedQuestions(cached);
      return;
    }

    try {
      const res = await api.suggestQuestions(
        scope,
        scope === "current" ? paperIds : undefined,
        scope === "collection" ? activeCollectionId : undefined
      );
      if (!controller.signal.aborted) {
        const qs = res.questions.length > 0 ? res.questions : [];
        questionsCacheRef.current.set(key, qs);
        setSuggestedQuestions(qs);
      }
    } catch {
      if (!controller.signal.aborted) {
        setSuggestedQuestions([]);
      }
    }
  }, [scope, paperIds, activeCollectionId, getScopeKey]);

  useEffect(() => {
    fetchSuggestedQuestions();
    return () => questionsAbortRef.current?.abort();
  }, [fetchSuggestedQuestions]);

  const handleCancelStream = () => {
    activeChatStreamRef.current?.abort();
    activeChatStreamRef.current = null;
    setIsStreaming(false);
    setLoading(false);
    setMessages((prev) => prev.map((m, i) =>
      i === prev.length - 1 && m.role === "assistant"
        ? { ...m, content: `${m.content}\n\n[Đã dừng tạo phản hồi từ AI.]` }
        : m
    ));
    toast.addToast("info", "Đã dừng tạo phản hồi từ AI.");
  };

  const handleSend = async (overrideText?: string) => {
    const text = overrideText?.trim() ?? input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Phân biệt rõ các chế độ scope:
    // - current: chỉ tìm trong paper(s) đã chọn (yêu cầu phải có paperIds)
    // - library: tìm trong tất cả papers
    // - collection: tìm trong collection/project đã chọn
    // - external: không dùng tài liệu, AI tự trả lời
    let effectiveIds: string[] | undefined;
    if (scope === "current") {
      if (paperIds.length === 0) {
        const errMsg: Message = {
          role: "assistant",
          content: "❌ **Chưa chọn paper nào!**\n\nChế độ **📄 Paper hiện tại** yêu cầu bạn phải chọn ít nhất 1 paper từ thư viện trước.\n\n👉 Chuyển sang **📚 Toàn bộ thư viện** để hỏi tất cả, hoặc quay lại thư viện chọn paper.",
        };
        setMessages((prev) => [...prev, errMsg]);
        setLoading(false);
        return;
      }
      effectiveIds = paperIds;
    } else if (scope === "library") {
      effectiveIds = undefined; // search tất cả papers
    } else if (scope === "collection") {
      if (!activeCollectionId) {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: "❌ **Chưa chọn collection.** Hãy tạo hoặc chọn một collection/project trước khi chat theo phạm vi này.",
        }]);
        setLoading(false);
        return;
      }
      effectiveIds = undefined;
    } else {
      effectiveIds = undefined; // external: không filter
    }

    try {
      if (stream && initialMode === "chat") {
        const ids = effectiveIds;
        const streamCtrl = api.chatStream(text, ids, scope, "default", scope === "collection" ? activeCollectionId : undefined, reasoningMode);
        activeChatStreamRef.current = streamCtrl;
        const assistantIdx = messages.length + 1;

        const loadingMsg = scope === "external" ? "Đang xử lý câu hỏi..." : "Đang tra cứu tài liệu...";
        setMessages((prev) => [...prev, { role: "assistant", content: loadingMsg }]);
        setIsStreaming(true);

        let resolved = false;

        const finishWithError = (errMsg: string) => {
          if (resolved) return;
          resolved = true;
          activeChatStreamRef.current = null;
          setIsStreaming(false);
          setLoading(false);
          const content = `❌ Lỗi: ${errMsg}`;
          setMessages((prev) => prev.map((m, i) =>
            i === assistantIdx ? { ...m, content } : m
          ));
        };

        streamCtrl.onStatus = (status) => {
          setMessages((prev) => prev.map((m, i) =>
            i === assistantIdx ? { ...m, content: status } : m
          ));
        };

        streamCtrl.onChunk = (chunk) => {
          setMessages((prev) => prev.map((m, i) => {
            if (i !== assistantIdx) return m;
            const current = m.content;
            if (current.startsWith("Dang ") || current.includes("Đang")) {
              return { ...m, content: chunk };
            }
            return { ...m, content: current + chunk };
          }));
        };

        streamCtrl.onDone = (model, citations, router_reason, token_count, modified_content) => {
          if (resolved) return;
          resolved = true;
          activeChatStreamRef.current = null;
          setIsStreaming(false);
          setMessages((prev) => prev.map((m, i) =>
            i === assistantIdx
              ? {
                  ...m,
                  model_used: model,
                  citations,
                  router_reason,
                  token_count,
                  content: modified_content || m.content,
                }
              : m
          ));
          loadUsage();
        };

        streamCtrl.onError = (err) => {
          if (resolved) return;
          resolved = true;
          activeChatStreamRef.current = null;
          setIsStreaming(false);
          finishWithError(err);
        };
      } else {
        let res: ChatResponse;
        if (initialMode === "review") {
          res = await api.review(text, effectiveIds, scope === "collection" ? activeCollectionId : undefined);
        } else if (initialMode === "critique") {
          res = await api.critique(text, effectiveIds, scope === "collection" ? activeCollectionId : undefined);
        } else if (initialMode === "debate") {
          res = await api.debate(text, effectiveIds, scope === "collection" ? activeCollectionId : undefined);
        } else if (initialMode === "verify") {
          if (stream) {
            const ids = effectiveIds;
            const streamCtrl = api.verifyStream(text, ids, "verify", scope === "collection" ? activeCollectionId : undefined);
            activeChatStreamRef.current = streamCtrl;
            const assistantIdx = messages.length + 1;

            setMessages((prev) => [...prev, { role: "assistant", content: "Đang tra cứu tài liệu..." }]);
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
                if (current === "Đang tra cứu tài liệu...") {
                  return { ...m, content: chunk };
                }
                return { ...m, content: current + chunk };
              }));
            };

            streamCtrl.onDone = (model, citations, externalSources, status) => {
              activeChatStreamRef.current = null;
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
              activeChatStreamRef.current = null;
              setIsStreaming(false);
              const content = `❌ Lỗi: ${err}\n\n> 💡 Đảm bảo FastAPI backend đang chạy: \`cd backend && uvicorn main:app --reload --port 8765\``;
              setMessages((prev) => prev.map((m, i) =>
                i === assistantIdx ? { ...m, content } : m
              ));
            };

            // Early return — skip the non-streaming res assignment below
            return;
          } else {
            const vres = await api.verify(text, effectiveIds, scope === "collection" ? activeCollectionId : undefined);
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
          res = await api.chat(text, effectiveIds, scope, scope === "collection" ? activeCollectionId : undefined, reasoningMode);
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
      const content = `❌ Lỗi: ${errorText}`;
      const errMsg: Message = {
        role: "assistant",
        content,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = async (action: string) => {
    if (action === "deep_research") {
      const q = input.trim();
      if (!q) {
        toast.addToast("error", "❌ Nhập câu hỏi trước khi dùng Deep Research.");
        return;
      }
      setMessages((prev) => [...prev, { role: "user", content: q }]);
      setLoading(true);
      try {
        const res = await api.deepResearch(q, scope === "current" ? paperIds : undefined);
        const personaInfo = res.personas?.length
          ? "\n\n---\n*🔬 **Deep Research** — " + res.personas.map(p => `*${p.name}* (${p.focus_areas.join(", ")})`).join(" · ") + "*"
          : "";
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: res.content + personaInfo,
          model_used: `🔬 Deep Research`,
        }]);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Lỗi không xác định";
        setMessages((prev) => [...prev, { role: "assistant", content: `❌ Deep Research thất bại: ${errMsg}` }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    const actions: Record<string, { query: string; mode: string }> = {
      summary: { query: "Tóm tắt các ý chính của paper này", mode: "chat" },
      verify: { query: "Xác thực các kết quả nghiên cứu trong các paper này dựa trên dữ liệu học thuật bên ngoài", mode: "verify" },
      debate: { query: "Tạo tranh luận AI: ủng hộ và phản biện các luận điểm chính", mode: "debate" },
      related: { query: "Tìm các nghiên cứu liên quan đến chủ đề của paper này", mode: "chat" },
      insight: { query: "Phân tích khoảng trống nghiên cứu, điểm mạnh điểm yếu và hướng phát triển", mode: "gap" },
    };
    const act = actions[action];
    if (!act) return;

    // Kiểm tra scope trước khi xử lý quick action
    const quickIds = (() => {
      if (scope === "current") {
        if (paperIds.length === 0) return "error";
        return paperIds;
      }
      return undefined; // library hoặc external → search tất cả
    })();

    if (quickIds === "error") {
      setMessages((prev) => [...prev, { role: "user", content: act.query }]);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "❌ **Chưa chọn paper nào!**\n\nChế độ **📄 Paper hiện tại** yêu cầu bạn phải chọn ít nhất 1 paper từ thư viện trước.",
      }]);
      return;
    }

    if (scope === "external") {
      setInput(act.query);
      await handleSend(act.query);
      return;
    }

    setInput(act.query);
    if (act.mode === "verify") {
      setMessages((prev) => [...prev, { role: "user", content: act.query }]);
      setLoading(true);
      try {
        const vres = await api.verify(act.query, quickIds, scope === "collection" ? activeCollectionId : undefined);
        setVerifyResult(vres);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: vres.answer,
          citations: vres.citations,
          model_used: vres.model_used,
        }]);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Lỗi không xác định";
        setMessages((prev) => [...prev, { role: "assistant", content: `❌ Lỗi: ${errMsg}` }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (act.mode === "gap") {
      setMessages((prev) => [...prev, { role: "user", content: act.query }]);
      setLoading(true);
      try {
        const res = await api.findResearchGap(quickIds);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: res.answer,
          citations: res.citations,
          model_used: res.model_used,
        }]);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Lỗi không xác định";
        setMessages((prev) => [...prev, { role: "assistant", content: `❌ Lỗi: ${errMsg}` }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    await handleSend(act.query);
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
    const assistantMessages = messages.filter(
      m => m.role === "assistant" && m.content
    );
    if (assistantMessages.length === 0) return;

    const combinedContent = assistantMessages
      .map((msg, i) => {
        const header = i === 0 ? "# Synthesis Report" : `---\n## Phần ${i + 1}`;
        const modelInfo = msg.model_used ? `*Model: ${msg.model_used}*` : "";
        return `${header}\n${modelInfo}\n\n${msg.content}`;
      })
      .join("\n\n");

    try {
      await triggerSynthesisExport(combinedContent, format);

      toast.addToast(
        "success",
        `Đã tải ${format.toUpperCase()} thành công`
      );
    } catch (err) {
      toast.addToast(
        "error",
        `Xuất ${format.toUpperCase()} thất bại`
      );
    }
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

  // Filter papers based on search
  const filteredPapers = availablePapers.filter(p =>
    !paperSearch || p.title.toLowerCase().includes(paperSearch.toLowerCase()) ||
    p.authors.toLowerCase().includes(paperSearch.toLowerCase())
  );

  const handleSelectAllPapers = () => {
    const allFilteredIds = filteredPapers.map(p => p.id);
    setTempPaperIds(prev => {
      const merged = new Set([...prev, ...allFilteredIds]);
      return Array.from(merged);
    });
  };

  const handleDeselectAllPapers = () => {
    const allFilteredIds = filteredPapers.map(p => p.id);
    setTempPaperIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
  };

  const displayQuestions = suggestedQuestions.length > 0 ? suggestedQuestions : null;

  const formatContent = (text: string, msgCitations?: CitationInfo[]) => {
    return (
      <MarkdownRenderer
        text={text}
        citations={msgCitations?.map(c => ({
          ref_id: c.ref_id || 0,
          paper_title: c.paper_title,
          page: c.page,
          text_snippet: c.text_snippet,
        }))}
        onCitationClick={(refId) => {
          if (!msgCitations) {
            console.warn("[Citation] No citations for this message");
            return;
          }
          const citation = msgCitations.find(c => c.ref_id === refId);
          if (!citation) {
            console.warn(`[Citation] ref_id=${refId} not found in citations`, msgCitations);
            toast.addToast("error", `❌ Không tìm thấy nguồn [${refId}]`);
            return;
          }
          console.log("[Citation] Clicked:", citation);
          const paperId = citation.paper_id;
          if (!paperId) {
            console.warn("[Citation] paper_id is empty:", citation);
            toast.addToast("error", `❌ Không tìm thấy paper_id cho nguồn [${refId}]`);
            return;
          }
          const page = citation.page || 1;
          const cacheBuster = Date.now();
          const pdfUrl = `${BASE_URL}/api/papers/${paperId}/file#page=${page}&_=${cacheBuster}`;
          console.log("[Citation] Opening PDF:", pdfUrl);
          setPdfPaperUrl(pdfUrl);
          setShowPdfViewer(true);
          toast.addToast("success", `Đã mở PDF trang ${page}`);
        }}
      />
    );
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
    <div className="chat-view-container" style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
      {showPdfViewer && pdfPaperUrl && (
        <div className="chat-pdf-panel" style={{ width: "50%", height: "100%", borderRight: "1px solid var(--color-border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="pdf-panel-header" style={{ height: "48px", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)", flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "50%" }}>
              📖 {paperIds.length === 1 ? (paperTitles.get(paperIds[0]) || "Tài liệu") : "Tài liệu"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                onClick={handlePasteHighlight}
                style={{
                  background: "rgba(99, 102, 241, 0.08)",
                  color: "var(--color-primary, #6366f1)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  borderRadius: "var(--radius-sm, 4px)",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
                title="Trích dẫn văn bản đang chọn trong PDF"
              >
                📋 Trích dẫn
              </button>
              <button
                onClick={() => setShowPdfViewer(false)}
                style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "1rem", fontWeight: "bold" }}
                title="Đóng trình xem PDF"
              >
                ✕
              </button>
            </div>
          </div>
          <iframe
            key={pdfPaperUrl}
            src={pdfPaperUrl}
            style={{ width: "100%", height: "calc(100% - 48px)", border: "none" }}
            title="PDF Viewer"
          />
        </div>
      )}
      <div className="chat-view" style={{ flex: 1, width: showPdfViewer ? "50%" : "100%", display: "flex", flexDirection: "column" }}>
        <div className="chat-view-header">
          <h2 className="chat-view-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* <IconBrain
              size={22}
              className="icon-gradient"
              style={{ verticalAlign: "middle", marginRight: 8 }}
            />
            Chat Nghiên Cứu */}
            {paperIds.length === 1 && pdfPaperUrl && !showPdfViewer && (
              <button
                onClick={() => setShowPdfViewer(true)}
                style={{
                  background: "rgba(99, 102, 241, 0.08)",
                  color: "var(--color-primary, #6366f1)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  borderRadius: "var(--radius-sm, 4px)",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  marginLeft: "12px",
                  whiteSpace: "nowrap"
                }}
                title="Mở trình xem PDF song song"
              >
                📖 Xem PDF
              </button>
            )}
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
              Citation
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
          {/* {usage && usage.mode === "cloud_free" && (
            <span
              className="chat-view-papers-badge"
              style={{
                background: "rgba(99, 102, 241, 0.08)",
                color: "var(--color-primary, #6366f1)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
              }}
            >
              <IconZap size={14} /> Free Cloud: {usage.used}/{usage.limit} câu
            </span>
          )} */}
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
              <IconCheck size={14} /> Review tự động
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
              <IconSearch size={14} /> Xác thực nghiên cứu
            </span>
          )}
          {messages.length > 0 && (
            <button className="chat-view-clear-btn" onClick={clearChat}>
              <IconTrash size={16} /> Xoá
            </button>
          )}
        </div>
      </div>

      <div className="chat-view-controls-bar">
        <div className="chat-view-scope-tabs">
          <button
            type="button"
            className={`chat-view-scope-tab ${scope === "current" ? "active" : ""}`}
            onClick={() => setScope("current")}
          >
            <IconFileText size={14} /> Paper hiện tại
          </button>
          <button
            type="button"
            className={`chat-view-scope-tab ${scope === "library" ? "active" : ""}`}
            onClick={() => setScope("library")}
          >
            <IconLibrary size={14} /> Toàn bộ thư viện
          </button>
          <button
            type="button"
            className={`chat-view-scope-tab ${scope === "collection" ? "active" : ""}`}
            onClick={() => setScope("collection")}
          >
            <IconBook size={14} /> Collection
          </button>
          <button
            type="button"
            className={`chat-view-scope-tab ${scope === "external" ? "active" : ""}`}
            onClick={() => setScope("external")}
          >
            <IconSearch size={14} /> Nghiên cứu bên ngoài
          </button>
        </div>

        {scope === "collection" && (
          <div className="chat-view-selected-papers-tray">
            <select
              className="chat-collection-select"
              value={activeCollectionId}
              onChange={(e) => setActiveCollectionId(e.target.value)}
            >
              {collections.length === 0 ? (
                <option value="">Chưa có collection</option>
              ) : collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name} ({collection.paper_count})
                </option>
              ))}
            </select>
          </div>
        )}

        {scope === "current" && (
          <div className="chat-view-selected-papers-tray">
            {paperIds.length > 0 ? (
              <div className="selected-papers-list">
                {paperIds.map(id => {
                  const title = paperTitles.get(id) || "Đang tải...";
                  return (
                    <div key={id} className="selected-paper-badge" title={title}>
                      <IconFileText size={12} className="paper-badge-icon" />
                      <span className="paper-badge-title">{title}</span>
                      <button
                        type="button"
                        className="paper-badge-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaperIds(prev => prev.filter(x => x !== id));
                        }}
                        title="Bỏ chọn"
                      >
                        <IconClose size={12} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="chat-view-paper-picker-trigger-btn"
                  onClick={openPaperPicker}
                  title="Thay đổi hoặc thêm paper"
                >
                  <IconLibrary size={12} />
                  Thay đổi
                </button>
              </div>
            ) : (
              <div className="selected-papers-empty">
                <span className="empty-hint">Chưa chọn paper nào để chat.</span>
                {availablePapers.length > 0 ? (
                  <button
                    type="button"
                    className="chat-view-paper-picker-trigger-btn primary-trigger"
                    onClick={openPaperPicker}
                  >
                    <IconLibrary size={12} />
                    Chọn paper
                  </button>
                ) : loadingPapers ? (
                  <span className="loading-hint">⏳ Đang tải tài liệu...</span>
                ) : (
                  <span className="import-hint">
                    Chưa có paper trong thư viện. {onGoToLibrary ? (
                      <button type="button" onClick={onGoToLibrary} className="inline-import-btn">Import</button>
                    ) : <strong>Import</strong>} ngay.
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="chat-view-messages" ref={listRef} onScroll={() => {
        const el = listRef.current;
        if (!el) return;
        isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      }}>
        {messages.length === 0 && !showCitePanel && (
          <div className="chat-view-empty">
            <IconBrain size={56} className="icon-gradient" />
            <h3>Hỏi về research của bạn</h3>
            <p>
              Chọn paper trong thư viện hoặc hỏi tất cả. AI sẽ trả lời có
              trích dẫn nguồn.
            </p>
            {displayQuestions && (
              <div className="chat-view-suggestions">
                {displayQuestions.map((q, i) => (
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
            )}
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
                  {copiedAll ? "✓ Đã copy" : "Copy tất cả"}
                </button>
                <button
                  className="cite-export-bib-btn"
                  onClick={handleExportBibtex}
                  title="Export BibTeX (.bib)"
                >
                  <IconDownload size={14} /> .bib
                </button>
                <button
                  className="cite-close-btn"
                  onClick={() => setShowCitePanel(false)}
                >
                  <IconClose size={14} />
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
              ) : (
                  <>
                    <div className="chat-view-text">
                      {formatContent(msg.content, msg.citations)}
                      {isStreaming && i === messages.length - 1 && (
                        <span className="streaming-cursor">|</span>
                      )}
                    </div>
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="chat-view-footnotes" style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-muted, #94a3b8)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Nguồn tham khảo
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {msg.citations.map((c, j) => (
                            <div
                              key={j}
                              className="chat-view-footnote-entry"
                              onClick={() => {
                                console.log("[Citation] Footnote clicked:", c);
                                if (!c.ref_id) {
                                  console.warn("[Citation] Footer: ref_id missing");
                                  toast.addToast("error", "❌ Thiếu ref_id");
                                  return;
                                }
                                if (!c.paper_id) {
                                  console.warn("[Citation] Footer: paper_id missing:", c);
                                  // toast.addToast("error", "❌ Không tìm thấy file PDF cho nguồn này");
                                  return;
                                }
                                const page = c.page || 1;
                                const cacheBuster = Date.now();
                                const pdfUrl = `${BASE_URL}/api/papers/${c.paper_id}/file#page=${page}&_=${cacheBuster}`;
                                console.log("[Citation] Footer opening PDF:", pdfUrl);
                                setPdfPaperUrl(pdfUrl);
                                setShowPdfViewer(true);
                                // toast.addToast("success", `Đã mở PDF trang ${page}`);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "8px",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                background: "rgba(99, 102, 241, 0.04)",
                                border: "1px solid rgba(99, 102, 241, 0.08)",
                                cursor: c.paper_id ? "pointer" : "default",
                                transition: "background 0.15s",
                                fontSize: "0.82rem",
                                lineHeight: 1.4,
                              }}
                              onMouseEnter={(e) => { if (c.paper_id) (e.currentTarget as HTMLDivElement).style.background = "rgba(99, 102, 241, 0.1)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(99, 102, 241, 0.04)"; }}
                            >
                              <span
                                style={{
                                  flexShrink: 0,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "22px",
                                  height: "22px",
                                  borderRadius: "4px",
                                  background: "var(--color-primary, #6366f1)",
                                  color: "#fff",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  marginTop: "2px",
                                }}
                              >
                                {c.ref_id || j + 1}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: "var(--color-text, #e4e4e7)", marginBottom: "1px" }}>
                                  {c.paper_title || c.source}
                                </div>
                                {c.page && (
                                  <div style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: "0.78rem", marginBottom: "4px" }}>
                                    Trang {c.page}
                                  </div>
                                )}
                                {c.text_snippet && (
                                  <div
                                    style={{
                                      color: "var(--color-text-secondary, #a3a3a3)",
                                      fontSize: "0.78rem",
                                      fontStyle: "italic",
                                      marginBottom: "4px",
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    &ldquo;{c.text_snippet}&rdquo;
                                  </div>
                                )}
                                {c.paper_id && (
                                  <div style={{ color: "var(--color-primary, #6366f1)", fontSize: "0.75rem", fontWeight: 500 }}>
                                    📄 Mở PDF →
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
              )}

              {initialMode === "verify" && verifyResult && i === messages.length - 1 && msg.role === "assistant" && (
                <VerifyPanel
                  sources={verifyResult.external_sources}
                  status={verifyResult.verify_status}
                  onRefresh={(doi) => {
                    toast.addToast("success", `Đã xoá cache cho ${doi}. Hãy gửi lại truy vấn để làm mới dữ liệu.`);
                  }}
                />
              )}

              {msg.role === "assistant" && (
                <div className="chat-view-model-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "8px", fontSize: "0.78rem", color: "var(--color-text-muted, #94a3b8)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {msg.model_used ? (() => {
                      const slashIdx = msg.model_used.indexOf("/");
                      const provider = slashIdx > 0 ? msg.model_used.slice(0, slashIdx) : "";
                      const modelName = slashIdx > 0 ? msg.model_used.slice(slashIdx + 1) : msg.model_used;
                      const providerColors: Record<string, { bg: string; color: string }> = {
                        local: { bg: "rgba(99, 102, 241, 0.12)", color: "#818cf8" },
                        deepseek: { bg: "rgba(16, 185, 129, 0.12)", color: "#34d399" },
                        gemini: { bg: "rgba(251, 191, 36, 0.12)", color: "#fbbf24" },
                        claude: { bg: "rgba(168, 85, 247, 0.12)", color: "#c084fc" },
                        groq: { bg: "rgba(248, 113, 113, 0.12)", color: "#f87171" },
                        nvidia: { bg: "rgba(52, 211, 153, 0.12)", color: "#34d399" },
                        freemodel: { bg: "rgba(148, 163, 184, 0.12)", color: "#94a3b8" },
                      };
                      const pc = providerColors[provider] || { bg: "rgba(148, 163, 184, 0.12)", color: "#94a3b8" };
                      return (
                        <>
                          <span style={{ background: pc.bg, color: pc.color, padding: "1px 6px", borderRadius: "4px", fontWeight: 600, fontSize: "0.7rem" }}>
                            {provider || "?"}
                          </span>
                          <span style={{ fontSize: "0.78rem" }} title={`${msg.model_used}${msg.router_reason ? `\n${msg.router_reason}` : ""}${msg.token_count ? `\n${msg.token_count} tokens` : ""}`}>
                            {modelName}
                            {msg.router_reason && (
                              <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", marginLeft: 4, opacity: 0.6 }}>
                                · {msg.router_reason}
                              </span>
                            )}
                          </span>
                        </>
                      );
                    })() : (
                      <span>🤖 Assistant</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => copyToClipboard(msg.content)}
                      style={{ background: "transparent", border: "none", color: "var(--color-text-muted, #94a3b8)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      title="Sao chép nội dung"
                    >
                      Sao chép
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
      </div>          {/* ─── Quick Actions + Scope Selector ─────────────────────── */}
      <div className="chat-view-toolbar">
        <div className="chat-view-quick-actions">
          <button
            className="chat-view-action-btn"
            onClick={() => handleQuickAction("summary")}
            disabled={loading}
            title="Tóm tắt paper"
          >
            <IconFileText size={13} /> Tóm tắt
          </button>
          <button
            className="chat-view-action-btn"
            onClick={() => handleQuickAction("verify")}
            disabled={loading}
            title="Xác thực học thuật"
          >
            <IconSearch size={13} /> Xác thực
          </button>
          <button
            className="chat-view-action-btn"
            onClick={() => handleQuickAction("debate")}
            disabled={loading}
            title="Tranh luận AI đa chiều"
          >
            Tranh luận
          </button>
          <button
            className="chat-view-action-btn"
            onClick={() => handleQuickAction("related")}
            disabled={loading}
            title="Tìm nghiên cứu liên quan"
          >
            Liên quan
          </button>
          <button
            className="chat-view-action-btn"
            onClick={() => handleQuickAction("insight")}
            disabled={loading}
            title="Phân tích chuyên sâu"
          >
            <IconBulb size={13} /> Insight
          </button>
          <button
            className="chat-view-action-btn"
            onClick={() => handleQuickAction("deep_research")}
            disabled={loading || !input.trim()}
            title="Deep Research: phân tích câu hỏi thành nhiều hướng và tổng hợp"
            style={{
              color: "var(--color-primary, #6366f1)",
              fontWeight: 600,
              border: "1px solid rgba(99, 102, 241, 0.25)",
              background: "rgba(99, 102, 241, 0.05)"
            }}
          >
            <IconZap size={13} /> Deep Research
          </button>
          {paperIds.length === 1 && (
            <button
              className="chat-view-action-btn"
              onClick={handlePasteHighlight}
              disabled={loading}
              title="Trích dẫn văn bản đang chọn trong PDF"
              style={{
                color: "var(--color-primary, #6366f1)",
                fontWeight: 600,
                border: "1px dashed rgba(99, 102, 241, 0.3)",
                background: "rgba(99, 102, 241, 0.04)"
              }}
            >
              📋 Trích dẫn PDF
            </button>
          )}
        </div>
      </div>

      <div className="chat-view-input">
        <textarea
          className="chat-view-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            scope === "external"
              ? "Hỏi về nghiên cứu bên ngoài thư viện..."
              : "Hỏi về research của bạn..."
          }
          rows={2}
          disabled={loading}
        />
        <div className="chat-view-mode-container">
          <button
            className="chat-view-mode-select-trigger"
            onClick={() => setShowModeDropdown(!showModeDropdown)}
            title="Chọn chế độ suy luận"
          >
            {reasoningMode === "fast" ? "⚡ Fast" : reasoningMode === "deep" ? "🧠 Deep" : "🧠 Deep+"}
            <span className="dropdown-arrow"></span>
          </button>
          
          {showModeDropdown && (
            <>
              <div className="chat-view-dropdown-overlay" onClick={() => setShowModeDropdown(false)} />
              <div className="chat-view-mode-dropdown-menu">
                <div
                  className={`chat-view-mode-dropdown-item ${reasoningMode === "fast" ? "active" : ""}`}
                  onClick={() => {
                    setReasoningMode("fast");
                    setShowModeDropdown(false);
                  }}
                >
                  <span className="item-icon">⚡</span>
                  <div className="item-text">
                    <div className="item-title">Fast</div>
                    <div className="item-desc">Trả lời nhanh, không hiển thị suy nghĩ</div>
                  </div>
                </div>
                <div
                  className={`chat-view-mode-dropdown-item ${reasoningMode === "deep" ? "active" : ""}`}
                  onClick={() => {
                    setReasoningMode("deep");
                    setShowModeDropdown(false);
                  }}
                >
                  <span className="item-icon">🧠</span>
                  <div className="item-text">
                    <div className="item-title">Deep</div>
                    <div className="item-desc">Suy luận sâu với DeepSeek V4 Flash</div>
                  </div>
                </div>
                <div
                  className={`chat-view-mode-dropdown-item ${reasoningMode === "deep+" ? "active" : ""}`}
                  onClick={() => {
                    setReasoningMode("deep+");
                    setShowModeDropdown(false);
                  }}
                >
                  <span className="item-icon">🧠</span>
                  <div className="item-text">
                    <div className="item-title">Deep+</div>
                    <div className="item-desc">Lập luận chuyên sâu với DeepSeek R1</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <button
          className="chat-view-send-btn"
          onClick={() => isStreaming ? handleCancelStream() : handleSend()}
          disabled={!isStreaming && (loading || !input.trim())}
          title={isStreaming ? "Huy yeu cau dang chay" : "Gui"}
        >
          {isStreaming ? <IconClose size={20} /> : loading ? <IconSpinner size={20} /> : <IconSend size={20} />}
        </button>
      </div>

      {/* ─── Paper Picker Modal ────────────────────────────────── */}
      {showPaperPicker && (
        <div
          className="paper-picker-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPaperPicker(false); }}
        >
          <div className="paper-picker-modal">
            <div className="paper-picker-header">
              <div className="paper-picker-title">
                <IconLibrary size={18} />
                Chọn paper để chat
              </div>
              <button
                className="paper-picker-close"
                onClick={() => setShowPaperPicker(false)}
              >
                <IconClose size={16} />
              </button>
            </div>

            <div className="paper-picker-search">
              <input
                ref={paperSearchRef}
                type="text"
                className="paper-picker-search-input"
                placeholder="Tìm kiếm paper..."
                value={paperSearch}
                onChange={(e) => setPaperSearch(e.target.value)}
              />
              <div className="paper-picker-quick-actions">
                <button
                  type="button"
                  className="picker-quick-btn"
                  onClick={handleSelectAllPapers}
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  className="picker-quick-btn"
                  onClick={handleDeselectAllPapers}
                >
                  Bỏ chọn tất cả
                </button>
              </div>
            </div>

            <div className="paper-picker-list">
              {filteredPapers.length === 0 ? (
                <div className="paper-picker-empty">
                  {paperSearch ? "Không tìm thấy paper phù hợp." : "Chưa có paper nào trong thư viện."}
                </div>
              ) : (
                filteredPapers.map(p => {
                  const isSelected = tempPaperIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`paper-picker-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setTempPaperIds(prev =>
                          prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                        );
                      }}
                    >
                      <div className="paper-picker-checkbox-wrapper">
                        <input
                          type="checkbox"
                          className="paper-picker-checkbox"
                          checked={isSelected}
                          readOnly
                        />
                      </div>
                      <div className="paper-picker-item-icon">
                        <IconFileText size={16} />
                      </div>
                      <div className="paper-picker-item-info">
                        <div className="paper-picker-item-title">{p.title}</div>
                        {p.authors && (
                          <div className="paper-picker-item-authors">{p.authors}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="paper-picker-footer">
              <span className="paper-picker-count">
                Đã chọn <strong>{tempPaperIds.length}</strong> / {availablePapers.length} papers
              </span>
              <div className="paper-picker-footer-buttons">
                <button
                  className="paper-picker-library-btn"
                  onClick={() => {
                    setShowPaperPicker(false);
                    onGoToLibrary?.();
                  }}
                >
                  Vào Thư viện
                </button>
                <button
                  className="paper-picker-confirm-btn"
                  onClick={() => {
                    setPaperIds(tempPaperIds);
                    setShowPaperPicker(false);
                  }}
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
