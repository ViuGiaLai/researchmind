import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { api, BASE_URL, ChatResponse, CitationEntry, Collection, VerifyResponse, ClaimAnalysis } from "../../lib/api";
import { VerifyPanel } from "./VerifyPanel";
import { TrustPanel } from "./TrustPanel";
import { PdfViewer } from "../pdf/PdfViewer";
import { parseDebate, ParsedDebate } from "../../lib/debateParser";
import {
  IconBrain,
  IconBrainAi,
  IconBot,
  IconUser,
  IconTrash,
  IconSend,
  IconSpinner,
  IconBulb,
  IconFileText,
  IconStar,
  IconBook,
  IconBookOpen,
  IconLibrary,
  IconSearch,
  IconZap,
  IconCheck,
  IconClipboard,
  IconDownload,
  IconClose,
  IconArrowRight,
  IconWithText,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCitations(citations?: any[]): any[] {
  if (!citations) return [];
  return citations.map((c: any, i) => ({ ...c, ref_id: c.ref_id ?? i + 1 }));
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

const CITATION_STYLES: CitationStyle[] = ["apa", "ieee", "vancouver"];
function getCitationStyleLabel(style: CitationStyle): string {
  return i18n.t(`chat.citation_style_${style}`);
}

const OverflowAction: React.FC<{
  label: string;
  title: string;
  onClick: () => void;
  highlight?: boolean;
}> = ({ label, title, onClick, highlight }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 10px",
      borderRadius: "6px",
      border: "none",
      background: "transparent",
      color: highlight ? "var(--color-primary, #6366f1)" : "var(--color-text, #e4e4e7)",
      fontWeight: highlight ? 600 : 400,
      cursor: "pointer",
      fontSize: "0.82rem",
      whiteSpace: "nowrap",
      transition: "background 0.1s",
    }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
  >
    {label}
  </button>
);

export const ChatView: React.FC<{
  initialPaperIds?: string[];
  initialQuery?: string;
  initialMode?: "chat" | "review" | "critique" | "debate" | "verify";
  stream?: boolean;
  onGoToLibrary?: () => void;
}> = ({ initialPaperIds, initialQuery, initialMode = "chat", stream = true, onGoToLibrary }) => {
  const { t } = useTranslation();
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
  const [, setExportingSynthesis] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [scope, setScope] = useState<Scope>("current");
  const [reasoningMode, setReasoningMode] = useState<"fast" | "deep" | "deep+">("fast");
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [strictEvidence, setStrictEvidence] = useState(false);
  const [showOverflowActions, setShowOverflowActions] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState("");
  const [showPaperPicker, setShowPaperPicker] = useState(false);
  const [paperSearch, setPaperSearch] = useState("");
  const [tempPaperIds, setTempPaperIds] = useState<string[]>([]);
  const paperSearchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfPaperUrl, setPdfPaperUrl] = useState<string | null>(null);
  const [pdfPaperId, setPdfPaperId] = useState<string | null>(null);
  const [pdfHighlightText, setPdfHighlightText] = useState<string>("");
  const [pdfInitialPage, setPdfInitialPage] = useState(1);
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);
  const [claimAnalyses, setClaimAnalyses] = useState<Record<number, ClaimAnalysis>>({});

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
      setPdfPaperId(paperIds[0]);
      setPdfInitialPage(1);
      setPdfHighlightText("");
      setShowPdfViewer(true);
      setPdfRefreshKey(k => k + 1);
    } else {
      setPdfPaperUrl(null);
      setPdfPaperId(null);
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
        toast.addToast("success", t("chat.toast_paste_quote"));
      } else {
        toast.addToast("error", t("chat.toast_clipboard_empty"));
      }
    } catch (err) {
      toast.addToast("error", t("chat.toast_clipboard_error"));
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

  useEffect(() => {
    return () => {
      activeChatStreamRef.current?.abort();
    };
  }, []);

  const handleCancelStream = () => {
    activeChatStreamRef.current?.abort();
    activeChatStreamRef.current = null;
    setIsStreaming(false);
    setLoading(false);
    setMessages((prev) => prev.map((m, i) =>
      i === prev.length - 1 && m.role === "assistant"
        ? { ...m, content: `${m.content}\n\n${t("chat.cancelled")}` }
        : m
    ));
    toast.addToast("info", t("chat.cancelled_toast"));
  };

  const handleSend = async (overrideText?: string) => {
    const text = overrideText?.trim() ?? input.trim();
    if (!text || loading || isStreaming) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    let streamHandlesLoading = false;

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
          content: t("chat.no_papers_selected"),
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
          content: t("chat.no_collection"),
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
        streamHandlesLoading = true;
        const ids = effectiveIds;
        const streamCtrl = api.chatStream(text, ids, scope, "default", scope === "collection" ? activeCollectionId : undefined, reasoningMode, strictEvidence);
        activeChatStreamRef.current = streamCtrl;
        const assistantIdx = messages.length + 1;

        const loadingMsg = scope === "external" ? t("chat.processing") : t("chat.searching_docs");
        setMessages((prev) => [...prev, { role: "assistant", content: loadingMsg }]);
        setIsStreaming(true);

        let resolved = false;

        const releaseLoading = () => {
          setLoading(false);
        };

        const finishWithError = (errMsg: string) => {
          if (resolved) return;
          resolved = true;
          activeChatStreamRef.current = null;
          setIsStreaming(false);
          releaseLoading();
          const content = `Lỗi: ${errMsg}`;
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
          releaseLoading();
          setMessages((prev) => {
            const updated = prev.map((m, i) =>
              i === assistantIdx
                ? {
                    ...m,
                    model_used: model,
                    citations: normalizeCitations(citations),
                    router_reason,
                    token_count,
                    content: modified_content || m.content,
                  }
                : m
            );
            const finalContent = modified_content || updated[assistantIdx]?.content || "";
            if (finalContent && citations && citations.length > 0) {
              api.analyzeClaims(finalContent, citations).then((res) => {
                if (res.analysis) {
                  setClaimAnalyses((prevClaims) => ({ ...prevClaims, [assistantIdx]: res.analysis! }));
                }
              }).catch((err) => console.error("Claim analysis failed:", err));
            }
            return updated;
          });
          loadUsage();
        };

        streamCtrl.onError = (err) => {
          finishWithError(err);
        };
        return;
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
            streamHandlesLoading = true;
            const ids = effectiveIds;
            const streamCtrl = api.verifyStream(text, ids, "verify", scope === "collection" ? activeCollectionId : undefined);
            activeChatStreamRef.current = streamCtrl;
            const assistantIdx = messages.length + 1;

            setMessages((prev) => [...prev, { role: "assistant", content: t("chat.searching_docs") }]);
            setIsStreaming(true);

            let resolved = false;
            const releaseLoading = () => setLoading(false);

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
                if (current === t("chat.searching_docs")) {
                  return { ...m, content: chunk };
                }
                return { ...m, content: current + chunk };
              }));
            };

            streamCtrl.onDone = (model, citations, externalSources, status) => {
              if (resolved) return;
              resolved = true;
              activeChatStreamRef.current = null;
              setIsStreaming(false);
              releaseLoading();
              setMessages((prev) => {
                const answer = prev[assistantIdx]?.content || "";
                setVerifyResult({
                  answer,
                  citations,
                  model_used: model,
                  papers_used: [],
                  external_sources: externalSources,
                  verify_status: status as "full" | "partial" | "local_only",
                });
                return prev.map((m, i) =>
                  i === assistantIdx ? { ...m, model_used: model, citations: normalizeCitations(citations) } : m
                );
              });
              loadUsage();
            };

            streamCtrl.onError = (err) => {
              if (resolved) return;
              resolved = true;
              activeChatStreamRef.current = null;
              setIsStreaming(false);
              releaseLoading();
              const content = `Lỗi: ${err}\n\n> Đảm bảo FastAPI backend đang chạy: \`cd backend && uvicorn main:app --reload --port 8765\``;
              setMessages((prev) => prev.map((m, i) =>
                i === assistantIdx ? { ...m, content } : m
              ));
            };

            return;
          } else {
            const vres = await api.verify(text, effectiveIds, scope === "collection" ? activeCollectionId : undefined);
            setVerifyResult(vres);
            res = {
              answer: vres.answer,
              citations: normalizeCitations(vres.citations),
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
          citations: normalizeCitations(res.citations),
          model_used: res.model_used,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        loadUsage();
      }
    } catch (e) {
      const errorText = e instanceof Error ? e.message : t("chat.error_backend");
      const content = `Lỗi: ${errorText}`;
      const errMsg: Message = {
        role: "assistant",
        content,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      if (!streamHandlesLoading) {
        setLoading(false);
      }
    }
  };

  const handleQuickAction = async (action: string) => {
    if (action === "deep_research") {
      const q = input.trim();
      if (!q) {
        toast.addToast("error", t("chat.deep_research_need_question"));
        return;
      }
      setMessages((prev) => [...prev, { role: "user", content: q }]);
      setLoading(true);
      try {
        const res = await api.deepResearch(q, scope === "current" ? paperIds : undefined);
        const personaInfo = res.personas?.length
          ? "\n\n---\n**Deep Research** — " + res.personas.map(p => `*${p.name}* (${p.focus_areas.join(", ")})`).join(" · ") + "*"
          : "";
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: res.content + personaInfo,
          model_used: "Deep Research",
        }]);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : t("chat.error_unknown");
        setMessages((prev) => [...prev, { role: "assistant", content: `Deep Research thất bại: ${errMsg}` }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    const actions: Record<string, { query: string; mode: string }> = {
      summary: { query: t("chat.quick_summary_query"), mode: "chat" },
      verify: { query: t("chat.quick_verify_query"), mode: "verify" },
      debate: { query: t("chat.quick_debate_query"), mode: "debate" },
      related: { query: t("chat.quick_related_query"), mode: "chat" },
      insight: { query: t("chat.quick_insight_query"), mode: "gap" },
    };
    const act = actions[action];
    if (!act) return;

    // Kiểm tra scope trước khi xử lý quick action
    const collectionIdForApi = scope === "collection" ? activeCollectionId : undefined;
    const quickIds = ((): string[] | undefined | "error" => {
      if (scope === "current") {
        if (paperIds.length === 0) return "error";
        return paperIds;
      }
      if (scope === "collection") {
        if (!activeCollectionId) return "error";
        return undefined;
      }
      return undefined;
    })();

    if (quickIds === "error") {
      setMessages((prev) => [...prev, { role: "user", content: act.query }]);
      const errContent = scope === "collection"
        ? t("chat.no_collection_quick")
        : t("chat.no_papers_quick");
      setMessages((prev) => [...prev, { role: "assistant", content: errContent }]);
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
        const vres = await api.verify(act.query, quickIds, collectionIdForApi);
        setVerifyResult(vres);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: vres.answer,
          citations: normalizeCitations(vres.citations),
          model_used: vres.model_used,
        }]);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : t("chat.error_unknown");
        setMessages((prev) => [...prev, { role: "assistant", content: `Lỗi: ${errMsg}` }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (act.mode === "gap") {
      setMessages((prev) => [...prev, { role: "user", content: act.query }]);
      setLoading(true);
      try {
        const res = await api.findResearchGap(quickIds, collectionIdForApi);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: res.answer,
          citations: normalizeCitations(res.citations),
          model_used: res.model_used,
        }]);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : t("chat.error_unknown");
        setMessages((prev) => [...prev, { role: "assistant", content: `Lỗi: ${errMsg}` }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (act.mode === "debate") {
      setMessages((prev) => [...prev, { role: "user", content: act.query }]);
      setLoading(true);
      try {
        const res = await api.debate(act.query, quickIds, collectionIdForApi);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: res.answer,
          citations: normalizeCitations(res.citations),
          model_used: res.model_used,
        }]);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : t("chat.error_unknown");
        setMessages((prev) => [...prev, { role: "assistant", content: `Lỗi: ${errMsg}` }]);
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
      toast.addToast("error", t("chat.toast_export_report_error"));
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
        const header = i === 0 ? t("chat.synthesis_header") : t("chat.synthesis_section", { number: i + 1 });
        const modelInfo = msg.model_used ? `*Model: ${msg.model_used}*` : "";
        return `${header}\n${modelInfo}\n\n${msg.content}`;
      })
      .join("\n\n");

    try {
      await triggerSynthesisExport(combinedContent, format);

      toast.addToast(
        "success",
        t("chat.toast_export_success", { format: format.toUpperCase() })
      );
    } catch (err) {
      toast.addToast(
        "error",
        t("chat.toast_export_error", { format: format.toUpperCase() })
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
            toast.addToast("error", t("chat.toast_citation_not_found", { ref: refId }));
            return;
          }
          console.log("[Citation] Clicked:", citation);
          const paperId = citation.paper_id;
          if (!paperId) {
            console.warn("[Citation] paper_id is empty:", citation);
            toast.addToast("error", t("chat.toast_paper_id_missing", { ref: refId }));
            return;
          }
          const page = citation.page || 1;
          setPdfPaperId(paperId);
          setPdfPaperUrl(`${BASE_URL}/api/papers/${paperId}/file`);
          setPdfInitialPage(page);
          setPdfHighlightText(citation.text_snippet || citation.text || "");
          setShowPdfViewer(true);
          setPdfRefreshKey(k => k + 1);
          toast.addToast("success", t("chat.toast_pdf_open", { page }));
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
            <h4>{t("chat.debate_ai_a")}</h4>
            {parsed.aiA?.main && (
              <div className="debate-item">
                <strong>{t("chat.debate_argument")}</strong> {parsed.aiA.main}
              </div>
            )}
            {parsed.aiA?.rebuttal && (
              <div className="debate-item">
                <strong>{t("chat.debate_rebuttal")}</strong> {parsed.aiA.rebuttal}
              </div>
            )}
            {parsed.aiA?.citations &&
              parsed.aiA.citations.length > 0 && (
                <div className="debate-citations">
                  {parsed.aiA.citations.map((c, i) => (
                    <div key={i}>
                      <IconWithText icon={IconLibrary} size={14}>
                        {c.source}
                        {c.page ? `, ${t("chat.footnote_page", { page: c.page })}` : ""}
                      </IconWithText>
                    </div>
                  ))}
                </div>
              )}
          </div>

          <div className="debate-column debate-b">
            <h4>{t("chat.debate_ai_b")}</h4>
            {parsed.aiB?.main && (
              <div className="debate-item">
                <strong>{t("chat.debate_argument")}</strong> {parsed.aiB.main}
              </div>
            )}
            {parsed.aiB?.rebuttal && (
              <div className="debate-item">
                <strong>{t("chat.debate_rebuttal")}</strong> {parsed.aiB.rebuttal}
              </div>
            )}
            {parsed.aiB?.citations &&
              parsed.aiB.citations.length > 0 && (
                <div className="debate-citations">
                  {parsed.aiB.citations.map((c, i) => (
                    <div key={i}>
                  <IconWithText icon={IconLibrary} size={14}>
                        {c.source}
                        {c.page ? `, ${t("chat.footnote_page", { page: c.page })}` : ""}
                      </IconWithText>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {parsed.conclusion && (
          <div className="debate-conclusion">
            <h4>{t("chat.debate_conclusion")}</h4>
            <div>{parsed.conclusion}</div>
          </div>
        )}

        {parsed.suggestions && parsed.suggestions.length > 0 && (
          <div className="debate-suggestions">
            <h4>{t("chat.debate_suggestions")}</h4>
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
    <div
      className={`chat-view-container${showPdfViewer && pdfPaperId ? " chat-view-container--split" : ""}`}
      style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}
    >
      {showPdfViewer && pdfPaperId && (
        <PdfViewer
          key={`${pdfPaperId}-${pdfInitialPage}-${pdfRefreshKey}`}
          paperId={pdfPaperId}
          paperTitle={paperTitles.get(pdfPaperId) || t("pdf.preview_title")}
          initialPage={pdfInitialPage}
          highlightText={pdfHighlightText}
          onClose={() => setShowPdfViewer(false)}
          onCopyQuote={(text, page) => {
            const quote = `> "${text}" (tr.${page})\n\n`;
            setInput(prev => prev ? prev + quote : quote);
            toast.addToast("success", t("chat.toast_pdf_quote"));
          }}
        />
      )}
      <div className="chat-view chat-view--compact" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div className="chat-view-controls-bar">
        <div className="chat-view-controls-top">
          <div className="chat-view-scope-tabs">
            <button
              type="button"
              className={`chat-view-scope-tab ${scope === "current" ? "active" : ""}`}
              onClick={() => setScope("current")}
              title={t("chat.scope_hint_current")}
            >
              <IconFileText size={13} /> {t("chat.scope_current")}
            </button>
            <button
              type="button"
              className={`chat-view-scope-tab ${scope === "library" ? "active" : ""}`}
              onClick={() => setScope("library")}
              title={t("chat.scope_hint_library")}
            >
              <IconLibrary size={13} /> {t("chat.scope_library")}
            </button>
            <button
              type="button"
              className={`chat-view-scope-tab ${scope === "collection" ? "active" : ""}`}
              onClick={() => setScope("collection")}
              title={t("chat.scope_hint_collection")}
            >
              <IconBook size={13} /> {t("chat.scope_collection")}
            </button>
            <button
              type="button"
              className={`chat-view-scope-tab ${scope === "external" ? "active" : ""}`}
              onClick={() => setScope("external")}
              title={t("chat.scope_hint_external")}
            >
              <IconSearch size={13} /> {t("chat.scope_external")}
            </button>
          </div>
          <div className="chat-view-header-actions">
            {paperIds.length === 1 && pdfPaperUrl && !showPdfViewer && (
              <button
                type="button"
                className="chat-view-open-pdf-btn"
                onClick={() => setShowPdfViewer(true)}
                title={t("chat.open_pdf")}
              >
                <IconWithText icon={IconBookOpen} size={13}>PDF</IconWithText>
              </button>
            )}
            {paperIds.length > 0 && (
              <button
                className="chat-view-cite-btn"
                onClick={generateCitations}
                disabled={citeLoading}
                title={t("chat.citation_dialog")}
              >
                {citeLoading ? (
                  <IconSpinner size={13} />
                ) : (
                  <IconStar size={13} />
                )}
                {t("chat.citation_dialog")}
              </button>
            )}
            {paperIds.length > 0 && (
              <span className="chat-view-papers-badge">
                <IconFileText size={13} /> {paperIds.length}
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
                <IconCheck size={13} /> Review
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
                <IconSearch size={13} /> {t("chat.quick_verify")}
              </span>
            )}
            {messages.length > 0 && (
              <button type="button" className="chat-view-clear-btn" onClick={clearChat} title={t("chat.remove_paper_title")}>
                <IconTrash size={14} />
              </button>
            )}
          </div>
        </div>

        {scope === "collection" && (
          <div className="chat-view-selected-papers-tray">
            <select
              className="chat-collection-select"
              value={activeCollectionId}
              onChange={(e) => setActiveCollectionId(e.target.value)}
            >
              {collections.length === 0 ? (
                <option value="">{t("chat.no_collection_option")}</option>
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
                  const title = paperTitles.get(id) || t("common.loading");
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
                        title={t("chat.remove_paper_title")}
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
                  title={t("chat.change_paper_title")}
                >
                  <IconLibrary size={12} />
                  {t("chat.change_paper")}
                </button>
              </div>
            ) : (
              <div className="selected-papers-empty">
                <span className="empty-hint">{t("chat.no_paper_hint")}</span>
                {availablePapers.length > 0 ? (
                  <button
                    type="button"
                    className="chat-view-paper-picker-trigger-btn primary-trigger"
                    onClick={openPaperPicker}
                  >
                    <IconLibrary size={12} />
                    {t("chat.select_paper")}
                  </button>
                ) : loadingPapers ? (
                  <span className="loading-hint">
                    <IconWithText icon={IconSpinner} size={12}>{t("chat.loading_papers")}</IconWithText>
                  </span>
                ) : (
                  <span className="import-hint">
                    {t("chat.import_prompt")} {onGoToLibrary ? (
                      <button type="button" onClick={onGoToLibrary} className="inline-import-btn">{t("chat.import_now")}</button>
                    ) : <strong>{t("chat.import_now")}</strong>} {t("chat.import_now_action")}
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
            <h3>{t("chat.empty_title")}</h3>
            <p>
              {t("chat.empty_desc")}
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
                <span>{t("chat.citation_dialog")} ({getCitationStyleLabel(citeStyle)})</span>
              </div>
              <div className="cite-panel-actions">
                <div className="cite-style-selector">
                  {CITATION_STYLES.map((style) => (
                    <button
                      key={style}
                      className={`cite-style-btn ${citeStyle === style ? "active" : ""}`}
                      onClick={() => changeCiteStyle(style)}
                    >
                      {getCitationStyleLabel(style)}
                    </button>
                  ))}
                </div>
                <button
                  className="cite-copy-all-btn"
                  onClick={() => copyToClipboard(bibliography)}
                >
                  {copiedAll ? (
                    <IconWithText icon={IconCheck} size={14}>{t("chat.citation_copied")}</IconWithText>
                  ) : (
                    t("chat.citation_copy_all")
                  )}
                </button>
                <button
                  className="cite-export-bib-btn"
                  onClick={handleExportBibtex}
                  title={t("chat.export_bibtex")}
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
                    title={t("chat.copy_citation")}
                  >
                    {copiedIdx === i ? <IconCheck size={14} /> : <IconClipboard size={14} />}
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
                      <div className="chat-view-footnotes">
                        <div className="chat-view-footnotes-title">
                          {t("chat.footnote_title")}
                        </div>
                        <div className="chat-view-footnotes-list">
                          {msg.citations.map((c, j) => (
                            <div
                              key={j}
                              className="chat-view-footnote-entry"
                              onClick={() => {
                                console.log("[Citation] Footnote clicked:", c);
                                if (!c.ref_id) {
                                  console.warn("[Citation] Footer: ref_id missing");
                                  toast.addToast("error", t("chat.toast_ref_id_missing"));
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
                                setPdfPaperId(c.paper_id);
                                setPdfInitialPage(page);
                                setPdfHighlightText(c.text_snippet || c.text || "");
                                setShowPdfViewer(true);
                                setPdfRefreshKey(k => k + 1);
                                // toast.addToast("success", `Đã mở PDF trang ${page}`);
                              }}
                            >
                              <span className="chat-view-footnote-ref">
                                {c.ref_id || j + 1}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: "var(--color-text, #e4e4e7)", marginBottom: "1px" }}>
                                  {c.paper_title || c.source}
                                </div>
                                {c.page && (
                                  <div className="chat-view-footnote-meta">
                                    {t("chat.footnote_page", { page: c.page })}
                                  </div>
                                )}
                                {c.text_snippet && (
                                  <div className="chat-view-footnote-snippet">
                                    &ldquo;{c.text_snippet}&rdquo;
                                  </div>
                                )}
                                {c.paper_id && (
                                  <div className="chat-view-footnote-link">
                                    <IconWithText icon={IconFileText} size={14}>{t("chat.open_pdf")}</IconWithText>
                                    <IconArrowRight size={14} />
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
                    toast.addToast("success", t("chat.toast_verify_refresh", { doi }));
                  }}
                />
              )}

              {claimAnalyses[i] && msg.role === "assistant" && (
                <TrustPanel
                  analysis={claimAnalyses[i]}
                  onViewUncited={() => {
                    const uncited = claimAnalyses[i].uncited_claim_texts;
                    if (uncited.length > 0) {
                      toast.addToast("info", t("chat.toast_uncited_claims", { count: uncited.length }));
                    }
                  }}
                  onFindMoreSources={() => {
                    toast.addToast("info", t("chat.toast_find_sources"));
                  }}
                  onKeepOnlyCited={() => {
                    toast.addToast("info", t("chat.toast_keep_cited"));
                  }}
                  onExport={() => {
                    toast.addToast("info", t("chat.toast_export_claim"));
                  }}
                />
              )}

              {msg.role === "assistant" && (
                <div className="chat-view-model-footer">
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
                        nvidia_deepseek: { bg: "rgba(52, 211, 153, 0.12)", color: "#34d399" },
                        github: { bg: "rgba(13, 148, 136, 0.12)", color: "#14b8a6" },
                        github_deepseek_v3: { bg: "rgba(13, 148, 136, 0.12)", color: "#14b8a6" },
                        freemodel: { bg: "rgba(148, 163, 184, 0.12)", color: "#94a3b8" },
                        openrouter: { bg: "rgba(236, 72, 153, 0.12)", color: "#f472b6" },
                        openrouter_r1: { bg: "rgba(236, 72, 153, 0.12)", color: "#f472b6" },
                        cohere: { bg: "rgba(6, 182, 212, 0.12)", color: "#22d3ee" },
                        cloudflare: { bg: "rgba(250, 204, 21, 0.12)", color: "#eab308" },
                        cerebras: { bg: "rgba(168, 85, 247, 0.12)", color: "#a855f7" },
                      };
                      const pc = providerColors[provider] || { bg: "rgba(148, 163, 184, 0.12)", color: "#94a3b8" };
                      return (
                        <>
                          <span className="chat-view-model-provider" style={{ background: pc.bg, color: pc.color }}>
                            {provider || "?"}
                          </span>
                          <span className="chat-view-model-name" title={`${msg.model_used}${msg.router_reason ? `\n${msg.router_reason}` : ""}${msg.token_count ? `\n${msg.token_count} tokens` : ""}`}>
                            {modelName}
                            {msg.router_reason && (
                              <span className="chat-view-model-reason">
                                · {msg.router_reason}
                              </span>
                            )}
                          </span>
                        </>
                      );
                    })() : (
                      <IconWithText icon={IconBot} size={14}>{t("chat.model_assistant")}</IconWithText>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      className="chat-view-copy-btn"
                      onClick={() => copyToClipboard(msg.content)}
                      title={t("chat.copy_content_title")}
                    >
                      {t("chat.copy_content")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && !isStreaming && (
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
            title={t("chat.quick_summary")}
          >
            <IconFileText size={13} /> {t("chat.quick_summary")}
          </button>
          <button
            className="chat-view-action-btn"
            onClick={() => handleQuickAction("verify")}
            disabled={loading}
            title={t("chat.quick_verify")}
          >
            <IconSearch size={13} /> {t("chat.quick_verify")}
          </button>
          <button
            className="chat-view-action-btn"
            onClick={() => handleQuickAction("deep_research")}
            disabled={loading || !input.trim()}
            title={t("chat.quick_deep_research")}
            style={{
              color: "var(--color-primary, #6366f1)",
              fontWeight: 600,
              border: "1px solid rgba(99, 102, 241, 0.25)",
              background: "rgba(99, 102, 241, 0.05)"
            }}
          >
            <IconZap size={13} /> {t("chat.quick_deep_research")}
          </button>

          {/* Overflow menu */}
          <div style={{ position: "relative" }}>
            <button
              className="chat-view-action-btn"
              onClick={() => setShowOverflowActions(!showOverflowActions)}
              title={t("chat.quick_deep_research")}
            >
              <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>···</span>
            </button>

            {showOverflowActions && (
              <>
                <div
                  style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 99,
                  }}
                  onClick={() => setShowOverflowActions(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 4px)",
                    left: 0,
                    background: "var(--color-surface, #1a1a1a)",
                    border: "1px solid var(--color-border, #282828)",
                    borderRadius: "8px",
                    padding: "4px",
                    zIndex: 100,
                    minWidth: "160px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <OverflowAction
                    label={t("chat.quick_debate")}
                    title={t("chat.quick_debate")}
                    onClick={() => { handleQuickAction("debate"); setShowOverflowActions(false); }}
                  />
                  <OverflowAction
                    label={t("chat.quick_related")}
                    title={t("chat.quick_related")}
                    onClick={() => { handleQuickAction("related"); setShowOverflowActions(false); }}
                  />
                  <OverflowAction
                    label={t("chat.quick_insight")}
                    title={t("chat.quick_insight")}
                    onClick={() => { handleQuickAction("insight"); setShowOverflowActions(false); }}
                  />
                  {paperIds.length === 1 && (
                    <OverflowAction
                      label={t("chat.quick_pdf_quote")}
                      title={t("chat.quick_pdf_quote")}
                      onClick={() => { handlePasteHighlight(); setShowOverflowActions(false); }}
                      highlight
                    />
                  )}
                  <div style={{ height: "1px", background: "var(--color-border, #282828)", margin: "4px 0" }} />
                  <OverflowAction
                    label={t("chat.export_markdown")}
                    title={t("chat.export_markdown")}
                    onClick={() => { handleHeaderExport("md"); setShowOverflowActions(false); }}
                  />
                  <OverflowAction
                    label={t("chat.export_word")}
                    title={t("chat.export_word")}
                    onClick={() => { handleHeaderExport("docx"); setShowOverflowActions(false); }}
                  />
                  <OverflowAction
                    label={t("chat.export_html")}
                    title={t("chat.export_html")}
                    onClick={() => { handleHeaderExport("html"); setShowOverflowActions(false); }}
                  />
                  <OverflowAction
                    label={t("chat.export_pdf")}
                    title={t("chat.export_pdf")}
                    onClick={() => { handleHeaderExport("pdf"); setShowOverflowActions(false); }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="chat-view-input">
        <div className="chat-view-mode-container">
          <button
            type="button"
            className="chat-view-mode-select-trigger"
            onClick={() => setShowModeDropdown(!showModeDropdown)}
            title={t("chat.mode_fast_desc")}
          >
            {reasoningMode === "fast" ? (
              <IconWithText icon={IconZap} size={16}>{t("chat.mode_fast")}</IconWithText>
            ) : reasoningMode === "deep" ? (
              <IconWithText icon={IconBrainAi} size={16}>{t("chat.mode_deep")}</IconWithText>
            ) : (
              <IconWithText icon={IconBrainAi} size={16}>{t("chat.mode_deep_plus")}</IconWithText>
            )}
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
                  <span className="item-icon"><IconZap size={16} /></span>
                  <div className="item-text">
                    <div className="item-title">{t("chat.mode_fast")}</div>
                    <div className="item-desc">{t("chat.mode_fast_desc")}</div>
                  </div>
                </div>
                <div
                  className={`chat-view-mode-dropdown-item ${reasoningMode === "deep" ? "active" : ""}`}
                  onClick={() => {
                    setReasoningMode("deep");
                    setShowModeDropdown(false);
                  }}
                >
                  <span className="item-icon"><IconBrainAi size={16} /></span>
                  <div className="item-text">
                    <div className="item-title">{t("chat.mode_deep")}</div>
                    <div className="item-desc">{t("chat.mode_deep_desc")}</div>
                  </div>
                </div>
                <div
                  className={`chat-view-mode-dropdown-item ${reasoningMode === "deep+" ? "active" : ""}`}
                  onClick={() => {
                    setReasoningMode("deep+");
                    setShowModeDropdown(false);
                  }}
                >
                  <span className="item-icon"><IconBrainAi size={16} /></span>
                  <div className="item-text">
                    <div className="item-title">{t("chat.mode_deep_plus")}</div>
                    <div className="item-desc">{t("chat.mode_deep_plus_desc")}</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <textarea
          className="chat-view-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            scope === "external"
              ? t("chat.placeholder_external")
              : t("chat.placeholder_current")
          }
          disabled={loading}
        />
        <button
          type="button"
          className={`chat-view-strict-evidence-toggle${strictEvidence ? " is-active" : ""}`}
          onClick={() => setStrictEvidence(!strictEvidence)}
          title={strictEvidence ? t("chat.strict_on_title") : t("chat.strict_off_title")}
        >
          <span className="chat-view-strict-evidence-icon">
            {strictEvidence ? <IconCheck size={14} /> : <IconClose size={14} />}
          </span>
          <span>{strictEvidence ? t("chat.strict_on") : t("chat.strict_off")}</span>
        </button>
        <button
          type="button"
          className="chat-view-send-btn"
          onClick={() => isStreaming ? handleCancelStream() : handleSend()}
          disabled={!isStreaming && (loading || !input.trim())}
          title={isStreaming ? t("chat.cancel_stream") : t("chat.send")}
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
                {t("chat.paper_picker_title")}
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
                placeholder={t("chat.paper_picker_search")}
                value={paperSearch}
                onChange={(e) => setPaperSearch(e.target.value)}
              />
              <div className="paper-picker-quick-actions">
                <button
                  type="button"
                  className="picker-quick-btn"
                  onClick={handleSelectAllPapers}
                >
                  {t("chat.paper_picker_select_all")}
                </button>
                <button
                  type="button"
                  className="picker-quick-btn"
                  onClick={handleDeselectAllPapers}
                >
                  {t("chat.paper_picker_deselect_all")}
                </button>
              </div>
            </div>

            <div className="paper-picker-list">
              {filteredPapers.length === 0 ? (
                <div className="paper-picker-empty">
                  {paperSearch ? t("chat.paper_picker_empty") : t("chat.paper_picker_empty_library")}
                </div>
              ) : (
                filteredPapers.map(p => {
                  const isSelected = tempPaperIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`paper-picker-item ${isSelected ? "selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setTempPaperIds(prev =>
                          prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setTempPaperIds(prev =>
                            prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                          );
                        }
                      }}
                    >
                      <div className="paper-picker-checkbox-wrapper" aria-hidden>
                        <span className={`paper-picker-checkbox${isSelected ? " is-checked" : ""}`}>
                          {isSelected && <IconCheck size={12} />}
                        </span>
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
                {t("chat.selected_papers", { count: tempPaperIds.length, total: availablePapers.length })}
              </span>
              <div className="paper-picker-footer-buttons">
                <button
                  className="paper-picker-library-btn"
                  onClick={() => {
                    setShowPaperPicker(false);
                    onGoToLibrary?.();
                  }}
                >
                  {t("chat.paper_picker_go_library")}
                </button>
                <button
                  className="paper-picker-confirm-btn"
                  onClick={() => {
                    setPaperIds(tempPaperIds);
                    setShowPaperPicker(false);
                  }}
                >
                  {t("chat.paper_picker_confirm")}
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
