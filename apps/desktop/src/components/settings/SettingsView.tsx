import React, { useEffect, useState } from "react";
import { api, BASE_URL } from "../../lib/api";
import { open } from "@tauri-apps/plugin-shell";
import {
  IconBrain,
  IconSettings,
  IconCheck,
  IconError,
  IconSearch,
  IconSpinner,
  IconSparkle,
  IconLock,
  IconZap,
  IconKey,
  IconMonitor,
  IconFolder,
  IconFolderOpen,
  IconRefresh,
  IconTrash,
} from "../Icons";


type LlmMode = "cloud_free" | "cloud_custom" | "local";

interface SpecsResult {
  total_ram_gb: number;
  cpu_cores: number;
  suggested_tier: string;
  suggested_model: string;
}

export const SettingsView: React.FC = () => {
  // ── LLM Mode ────────────────────────────────────────────────
  const [llmMode, setLlmMode] = useState<LlmMode>("cloud_free");

  // ── Custom Cloud Providers ──────────────────────────────────
  type CustomProvider = "deepseek" | "gemini" | "claude" | "groq" | "nvidia" | "github" | "freemodel";
  const [customCloudProvider, setCustomCloudProvider] = useState<CustomProvider>("deepseek");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [claudeModel, setClaudeModel] = useState("claude-sonnet-4-20250514");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [groqModel, setGroqModel] = useState("llama-3.3-70b-versatile");
  const [nvidiaApiKey, setNvidiaApiKey] = useState("");
  const [nvidiaModel, setNvidiaModel] = useState("moonshotai/kimi-k2.6");
  const [freemodelApiKey, setFreemodelApiKey] = useState("");
  const [freemodelModel, setFreemodelModel] = useState("gpt-4o-mini");
  const [githubApiKey, setGithubApiKey] = useState("");
  const [githubModel, setGithubModel] = useState("gpt-4o-mini");

  // ── Local (llama-server) ──────────────────────────────────
  const [llamaServerUrl, setLlamaServerUrl] = useState("http://127.0.0.1:8080");
  const [localModel, setLocalModel] = useState("Qwen3-4B-Q4_K_M.gguf");

  // ── Machine Specs ───────────────────────────────────────────
  const [specs, setSpecs] = useState<SpecsResult | null>(null);
  const [specsLoading, setSpecsLoading] = useState(false);

  // ── Usage status ────────────────────────────────────────────
  const [usage, setUsage] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  // ── UI State ────────────────────────────────────────────────
  const [healthStatus, setHealthStatus] = useState<string>("Chưa kiểm tra");
  const [healthColor, setHealthColor] = useState("var(--color-text-muted)");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [embeddingMode, setEmbeddingMode] = useState("local");
  const [embeddingQueryInstruction, setEmbeddingQueryInstruction] = useState("");
  const [embeddingPassageInstruction, setEmbeddingPassageInstruction] = useState("");
  const [embeddingPooling, setEmbeddingPooling] = useState("cls");
  const [normalizeEmbeddings, setNormalizeEmbeddings] = useState(true);
  const [enableReranker, setEnableReranker] = useState(false);
  const [mmrLambda, setMmrLambda] = useState("");

  // ── Model Router (open-notebook inspired) ─────────
  const [largeContextThreshold, setLargeContextThreshold] = useState(105000);
  const [largeContextModel, setLargeContextModel] = useState("");
  const [largeContextProvider, setLargeContextProvider] = useState("");
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingTestResult, setEmbeddingTestResult] = useState<"success" | "error" | null>(null);
  const [embeddingTestMsg, setEmbeddingTestMsg] = useState<string>("");
  const [stats, setStats] = useState<{ total_papers: number; total_chunks: number; chroma_chunks: number; data_dir?: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // ── Provider Routing ────────────────────────────────────────
  const ALL_TASKS = [
    "summary", "daily_reader", "chat", "quality_check",
    "insight", "entity", "rag", "critique", "verify",
    "gap", "debate", "review", "research", "synthesis", "graph",
  ] as const;
  const ALL_PROVIDERS = [
    "github", "gemini", "deepseek", "groq", "nvidia", "freemodel",
    "claude", "openrouter", "cohere", "cloudflare", "cerebras", "local",
  ] as const;
  const PROVIDER_LABELS: Record<string, string> = {
    github: "GitHub Models", gemini: "Gemini", deepseek: "DeepSeek",
    groq: "Groq", nvidia: "Nvidia NIM", freemodel: "FreeModel",
    claude: "Claude", openrouter: "OpenRouter", cohere: "Cohere",
    cloudflare: "Cloudflare", cerebras: "Cerebras", local: "Local",
  };
  const TASK_LABELS: Record<string, string> = {
    summary: "Tóm tắt", daily_reader: "Daily Reader", chat: "Chat",
    quality_check: "Kiểm tra chất lượng", insight: "Insights",
    entity: "Trích xuất thực thể", rag: "RAG (có context)",
    critique: "Phản biện", verify: "Xác minh", gap: "Gap Analysis",
    debate: "Tranh luận", review: "Review Builder",
    research: "Nghiên cứu sâu", synthesis: "Tổng hợp", graph: "GraphRAG",
  };
  const [taskProviderMapStr, setTaskProviderMapStr] = useState("{}");
  const [taskFallbackMapStr, setTaskFallbackMapStr] = useState("{}");

  // ── Theme State ──────────────────────────────────────────────
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return (localStorage.getItem("app-theme") as "dark" | "light") || "dark"; } catch { return "dark"; }
  });

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("app-theme", next); } catch {}
  };

  // ── Data Management State ─────────────────────────────────────
  const [actionLoading, setActionLoading] = useState(false);
  const [storageMsg, setStorageMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [zoteroDataDir, setZoteroDataDir] = useState("");

  // ── Cache State ───────────────────────────────────────────────
  const [cacheStats, setCacheStats] = useState<{ llm_cache_count: number; embedding_cache_count: number } | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);

  // ── Model Status State ─────────────────────────────────────────
  const [modelStatus, setModelStatus] = useState<{
    embedder: { loaded: boolean; last_used: number; idle_seconds: number; model_name: string };
    reranker: { loaded: boolean; last_used: number; idle_seconds: number; model_name: string };
  } | null>(null);

  const loadModelStatus = async () => {
    try {
      const status = await api.getModelStatus();
      setModelStatus(status);
    } catch (e) {
      console.error("Failed to load model status:", e);
    }
  };

  useEffect(() => {
    loadSettings();
    loadStats();
    loadSpecs();
    loadUsage();
    loadCacheStats();
    loadModelStatus();
    checkHealth();
    
    const interval = setInterval(loadModelStatus, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      const s = await api.getSettings();
      setLlmMode(s.llm_mode as LlmMode);
      setClaudeApiKey(s.claude_api_key === "***" ? "" : s.claude_api_key);
      setClaudeModel(s.claude_model);
      setDeepseekApiKey(s.deepseek_api_key === "***" ? "" : s.deepseek_api_key);
      setDeepseekModel(s.deepseek_model);
      setGeminiApiKey(s.gemini_api_key === "***" ? "" : s.gemini_api_key);
      setGeminiModel(s.gemini_model || "gemini-2.5-flash");
      setGroqApiKey((s as any).groq_api_key === "***" ? "" : (s as any).groq_api_key || "");
      setGroqModel((s as any).groq_model || "llama-3.3-70b-versatile");
      setNvidiaApiKey((s as any).nvidia_api_key === "***" ? "" : (s as any).nvidia_api_key || "");
      setNvidiaModel((s as any).nvidia_model || "moonshotai/kimi-k2.6");
      setFreemodelApiKey((s as any).freemodel_api_key === "***" ? "" : (s as any).freemodel_api_key || "");
      setFreemodelModel((s as any).freemodel_model || "gpt-4o-mini");
      setGithubApiKey((s as any).github_api_key === "***" ? "" : (s as any).github_api_key || "");
      setGithubModel((s as any).github_model || "gpt-4o-mini");
      setCustomCloudProvider((s.custom_cloud_provider as CustomProvider) || "deepseek");
      setLlamaServerUrl((s as any).llama_server_url || "http://127.0.0.1:8080");
      setLocalModel((s as any).local_model || "Qwen3-4B-Q4_K_M.gguf");
      setEmbeddingModel(s.embedding_model);
      setEmbeddingMode(s.embedding_mode || "local");
      setEmbeddingQueryInstruction((s as any).embedding_query_instruction || (s as any).query_instruction || "");
      setEmbeddingPassageInstruction((s as any).embedding_passage_instruction || (s as any).passage_instruction || "");
      setEnableReranker(!!s.enable_reranker);
      setMmrLambda((s as any).mmr_lambda != null ? String((s as any).mmr_lambda) : "");
      setEmbeddingPooling((s as any).embedding_pooling || "cls");
      setNormalizeEmbeddings((s as any).normalize_embeddings !== false);
      setLargeContextThreshold((s as any).large_context_threshold || 105000);
      setLargeContextModel((s as any).large_context_model || "");
      setLargeContextProvider((s as any).large_context_provider || "");
      setZoteroDataDir((s as any).zotero_data_dir || "");
      setTaskProviderMapStr((s as any).task_provider_map || "{}");
      setTaskFallbackMapStr((s as any).task_fallback_map || "{}");
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  const testEmbedding = async () => {
    setTestingEmbedding(true);
    setEmbeddingTestResult(null);
    setEmbeddingTestMsg("");
    try {
      // Auto-save embedding_mode before testing so the change persists
      await api.updateSettings({ embedding_mode: embeddingMode });
      const res = await api.testEmbedding();
      if (res.success) {
        setEmbeddingTestResult("success");
        setEmbeddingTestMsg(res.message || "Kết nối thành công!");
      } else {
        setEmbeddingTestResult("error");
        setEmbeddingTestMsg(res.error || "Kết nối thất bại.");
      }
    } catch (e) {
      setEmbeddingTestResult("error");
      setEmbeddingTestMsg(e instanceof Error ? e.message : "Lỗi kết nối backend.");
    } finally {
      setTestingEmbedding(false);
    }
  };

  const loadStats = async () => {
    try {
      const s = await api.stats();
      setStats({
        total_papers: s.total_papers,
        total_chunks: s.total_chunks,
        chroma_chunks: s.chroma_chunks,
        data_dir: s.data_dir,
      });
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  };

  const loadSpecs = async () => {
    setSpecsLoading(true);
    try {
      const s = await api.detectSpecs();
      setSpecs(s);
    } catch (e) {
      console.error("Failed to detect specs:", e);
    } finally {
      setSpecsLoading(false);
    }
  };

  const handleOpenFolder = async () => {
    setActionLoading(true);
    setStorageMsg(null);
    try {
      const res = await api.openDataFolder();
      setStorageMsg({ type: "success", text: res.message || "Đã mở thư mục dữ liệu." });
    } catch (e) {
      setStorageMsg({ type: "error", text: e instanceof Error ? e.message : "Không thể mở thư mục." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeStoragePath = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<string | null>("select_folder");
      
      if (!selected) return;
      
      // 1. Check disk space for the new folder
      setStorageMsg({ type: "success", text: "⏳ Đang kiểm tra dung lượng ổ đĩa..." });
      const space = await api.getDiskSpace(selected);
      
      let confirmMsg = `Bạn muốn di chuyển toàn bộ dữ liệu hiện tại sang thư mục mới:\n👉 ${selected}\n\n`;
      confirmMsg += `Ổ đĩa đích còn trống: ${space.free_gb} GB.\n`;
      
      if (space.warning) {
        confirmMsg += `⚠️ CẢNH BÁO: Dung lượng ổ đĩa đích còn khá thấp (< 10GB). Bạn có chắc chắn muốn tiếp tục không?\n\n`;
      } else {
        confirmMsg += `Bạn có chắc chắn muốn di chuyển không?\n\n`;
      }
      
      const proceed = window.confirm(confirmMsg);
      if (!proceed) {
        setStorageMsg(null);
        return;
      }
      
      // 2. Perform moving storage
      setActionLoading(true);
      setStorageMsg({ type: "success", text: "⏳ Đang di chuyển dữ liệu (vui lòng không tắt ứng dụng)..." });
      
      const res = await api.moveStorage(selected);
      setStorageMsg({ type: "success", text: res.message || "Đã chuyển thư mục thành công." });
      
      // 3. Reload stats to show new path
      loadStats();
    } catch (e) {
      setStorageMsg({ type: "error", text: e instanceof Error ? e.message : "Lỗi chuyển thư mục dữ liệu." });
    } finally {
      setActionLoading(false);
    }
  };
 
  const handleSelectZoteroPath = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<string | null>("select_folder");
      if (selected) {
        setZoteroDataDir(selected);
        setStorageMsg({ type: "success", text: `Đã chọn thư mục Zotero: ${selected}` });
      }
    } catch (e) {
      console.error("Failed to select Zotero directory:", e);
      setStorageMsg({ type: "error", text: "Không thể mở hộp thoại chọn thư mục. Hãy nhập thủ công." });
    }
  };

  const handleDetectZotero = async () => {
    try {
      const res = await api.detectZoteroDataDir();
      if (res.found && res.path) {
        setZoteroDataDir(res.path);
        setStorageMsg({ type: "success", text: res.message });
      } else {
        setStorageMsg({ type: "error", text: res.message });
      }
    } catch (e: any) {
      setStorageMsg({ type: "error", text: `Lỗi phát hiện Zotero: ${e.message || e}` });
    }
  };

  const handleClearData = async () => {
    const confirmClear = window.confirm(
      "⚠️ CẢNH BÁO: Hành động này sẽ xoá TOÀN BỘ tài liệu PDF đã import, lịch sử chat, các ghi chú và cơ sở dữ liệu tìm kiếm vector. Cấu hình cài đặt và API Key của bạn vẫn được GIỮ LẠI.\n\nBạn có chắc chắn muốn tiếp tục?"
    );
    if (!confirmClear) return;

    setActionLoading(true);
    setStorageMsg(null);
    try {
      const res = await api.clearAllData();
      setStorageMsg({ type: "success", text: res.message || "Đã xoá dữ liệu thành công." });
      loadStats();
    } catch (e) {
      setStorageMsg({ type: "error", text: e instanceof Error ? e.message : "Xoá dữ liệu thất bại." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetApp = async () => {
    const confirmReset = window.confirm(
      "❌ CẢNH BÁO NGUY HIỂM: Hành động này sẽ xoá SẠCH HOÀN TOÀN cấu hình cài đặt, API Key, tài liệu PDF, lịch sử chat và vector database. Ứng dụng sẽ quay trở về trạng thái ban đầu như lúc vừa mới cài đặt.\n\nBạn có chắc chắn muốn reset toàn bộ ứng dụng không?"
    );
    if (!confirmReset) return;

    setActionLoading(true);
    setStorageMsg(null);
    try {
      const res = await api.resetApp();
      setStorageMsg({ type: "success", text: res.message || "Đã reset ứng dụng thành công. Đang khởi động lại..." });
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e) {
      setStorageMsg({ type: "error", text: e instanceof Error ? e.message : "Reset ứng dụng thất bại." });
    } finally {
      setActionLoading(false);
    }
  };

  const loadUsage = async () => {
    try {
      const u = await api.getChatUsage();
      setUsage(u);
    } catch (e) {
      console.error("Failed to load usage stats:", e);
    }
  };

  const loadCacheStats = async () => {
    try {
      const stats = await api.getCacheStats();
      setCacheStats(stats);
    } catch (e) {
      console.error("Failed to load cache stats:", e);
    }
  };

  const handleClearCache = async () => {
    const confirmClear = window.confirm("Bạn có chắc chắn muốn xoá bộ nhớ đệm LLM và Embedding? Hành động này sẽ khiến hệ thống phải gọi lại mô hình AI/API từ đầu ở lần chạy kế tiếp.");
    if (!confirmClear) return;

    setClearingCache(true);
    setCacheMsg(null);
    try {
      const res = await api.clearCache();
      setCacheMsg(res.message || "Đã xoá bộ nhớ đệm.");
      loadCacheStats();
    } catch (e) {
      alert("Xoá bộ nhớ đệm thất bại: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setClearingCache(false);
    }
  };

  const checkHealth = async () => {
    setChecking(true);
    setHealthStatus("Đang kiểm tra...");
    setHealthColor("var(--color-text-muted)");
    try {
      const h = await api.health();
      if (h.status === "ok") {
        setHealthStatus("Kết nối thành công");
        setHealthColor("var(--color-success, #22c55e)");
      } else {
        setHealthStatus("Backend không phản hồi");
        setHealthColor("var(--color-error, #ef4444)");
      }
    } catch {
      setHealthStatus("Không kết nối được backend");
      setHealthColor("var(--color-error, #ef4444)");
    } finally {
      setChecking(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      // Validate Custom Cloud API Key if chosen
      if (llmMode === "cloud_custom") {
        const activeKey =
          customCloudProvider === "deepseek"
            ? deepseekApiKey
            : customCloudProvider === "gemini"
            ? geminiApiKey
            : customCloudProvider === "claude"
            ? claudeApiKey
            : customCloudProvider === "groq"
            ? groqApiKey
            : customCloudProvider === "nvidia"
            ? nvidiaApiKey
            : customCloudProvider === "freemodel"
            ? freemodelApiKey
            : githubApiKey;
        const activeModel =
          customCloudProvider === "deepseek"
            ? deepseekModel
            : customCloudProvider === "gemini"
            ? geminiModel
            : customCloudProvider === "claude"
            ? claudeModel
            : customCloudProvider === "groq"
            ? groqModel
            : customCloudProvider === "nvidia"
            ? nvidiaModel
            : customCloudProvider === "freemodel"
            ? freemodelModel
            : githubModel;

        if (activeKey.trim() !== "") {
          setSaveMsg({ type: "success", text: "Đang kiểm tra kết nối API Key..." });
          const val = await api.validateApiKey(customCloudProvider, activeKey, activeModel);
          if (!val.valid) {
            setSaveMsg({ type: "error", text: `Lỗi kết nối API Key: ${val.error || "Không xác định"}` });
            setSaving(false);
            return;
          }
        }
      }

      await api.updateSettings({
        llm_mode: llmMode,
        custom_cloud_provider: customCloudProvider,
        claude_api_key: claudeApiKey,
        claude_model: claudeModel,
        deepseek_api_key: deepseekApiKey,
        deepseek_model: deepseekModel,
        gemini_api_key: geminiApiKey,
        gemini_model: geminiModel,
        groq_api_key: groqApiKey,
        groq_model: groqModel,
        nvidia_api_key: nvidiaApiKey,
        nvidia_model: nvidiaModel,
        github_api_key: githubApiKey,
        github_model: githubModel,
        freemodel_api_key: freemodelApiKey,
        freemodel_model: freemodelModel,
        llama_server_url: llamaServerUrl,
        local_model: localModel,
        embedding_mode: embeddingMode,
        embedding_query_instruction: embeddingQueryInstruction,
        embedding_passage_instruction: embeddingPassageInstruction,
        embedding_pooling: embeddingPooling,
        normalize_embeddings: normalizeEmbeddings,
        large_context_threshold: largeContextThreshold,
        large_context_model: largeContextModel,
        large_context_provider: largeContextProvider,
        enable_reranker: enableReranker,
        mmr_lambda: mmrLambda === "" ? null : parseFloat(mmrLambda),
        task_provider_map: taskProviderMapStr,
        task_fallback_map: taskFallbackMapStr,
      });
      if (zoteroDataDir.trim()) {
        await api.saveZoteroPath(zoteroDataDir.trim());
      }
      setSaveMsg({ type: "success", text: "Đã lưu cấu hình!" });
      loadSettings();
      loadUsage();
    } catch (e) {
      setSaveMsg({ type: "error", text: `Lỗi: ${e instanceof Error ? e.message : "Không thể lưu"}` });
    } finally {
      setSaving(false);
    }
  };

  const modeSuggestions = specs
    ? [
        { mode: "cloud_free" as LlmMode, label: "Cloud Free ", desc: "Miễn phí, chạy ngay", highlight: true },
        { mode: "cloud_custom" as LlmMode, label: "Custom API Key", desc: "Gemini, DeepSeek hoặc Claude API của riêng bạn", highlight: false },
        { mode: "local" as LlmMode, label: "Riêng tư tuyệt đối", desc: `Tải ~${specs.suggested_tier === "weak" ? "2" : specs.suggested_tier === "medium" ? "2" : "8"}GB, chạy offline`, highlight: false },
      ]
    : [];

  return (
    <div className="settings-view">
    <div className="settings-panel">
      <div className="settings-header">
        <h2 className="settings-title">
          <IconSettings size={22} style={{ verticalAlign: "middle", marginRight: 8 }} />
          Cài đặt
        </h2>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">
          <IconBrain size={18} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
          Backend
        </h3>
        <div className="settings-health" style={{ borderColor: healthColor }}>
          <div className="settings-health-indicator" style={{ background: healthColor }} />
          <div className="settings-health-info">
            <span className="settings-health-label" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {checking ? (
                <IconSpinner size={14} />
              ) : healthStatus === "Kết nối thành công" ? (
                <IconCheck size={14} style={{ color: "var(--color-success, #22c55e)" }} />
              ) : healthStatus.includes("không") || healthStatus.includes("Không") ? (
                <IconError size={14} style={{ color: "var(--color-error, #ef4444)" }} />
              ) : null}
              {healthStatus}
            </span>
            <span className="settings-health-hint">
              FastAPI backend: {BASE_URL}
            </span>
          </div>
          <button className="settings-health-btn" onClick={checkHealth} disabled={checking}>
            {checking ? <IconSpinner size={16} /> : <IconSearch size={16} />}
            <span>Kiểm tra</span>
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">
          <IconSparkle size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Giao diện
        </h3>
        <div className="settings-field">
          <label className="settings-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
            <span>Chế độ sáng / tối</span>
            <div
              onClick={toggleTheme}
              style={{
                width: 48, height: 26, borderRadius: 13, padding: 3, cursor: "pointer", display: "flex", alignItems: "center",
                background: theme === "dark" ? "var(--color-primary)" : "var(--color-border)", transition: "background 0.3s ease", flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "transform 0.3s ease",
                  transform: theme === "dark" ? "translateX(0)" : "translateX(22px)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </div>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <IconMonitor size={18} /> Thông số máy
        </h3>
        {specsLoading ? (
          <div className="aiwizard-loading">
            <IconSpinner size={16} /> Đang phát hiện cấu hình...
          </div>
        ) : specs ? (
          <div className="settings-specs">
            <div className="settings-spec-row">
              <span className="settings-spec-label">RAM</span>
              <span className="settings-spec-value">{specs.total_ram_gb} GB</span>
            </div>
            <div className="settings-spec-row">
              <span className="settings-spec-label">CPU</span>
              <span className="settings-spec-value">{specs.cpu_cores} cores</span>
            </div>
            <div className="settings-spec-row">
              <span className="settings-spec-label">Local model</span>
              <span className="settings-spec-value">{localModel}</span>
            </div>
          </div>
        ) : (
          <p className="settings-desc">Không thể phát hiện cấu hình máy.</p>
        )}
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">
          <IconSparkle size={18} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
          Chế độ AI
        </h3>
        <p className="settings-desc">
          Chọn cách AI hoạt động. Bạn có thể đổi bất cứ lúc nào.
        </p>

        <div className="settings-mode-cards">
          {modeSuggestions.map((m) => (
            <button
              key={m.mode}
              className={`settings-mode-card ${llmMode === m.mode ? "active" : ""}`}
              onClick={() => { setLlmMode(m.mode); setSaveMsg(null); }}
            >
              <div className="settings-mode-card-radio">
                {llmMode === m.mode && <div className="settings-mode-card-dot" />}
              </div>
              <div className="settings-mode-card-content" style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span className="settings-mode-card-icon" style={{ marginTop: "2px" }}>
                  {m.mode === "cloud_free" ? <IconZap size={18} /> : m.mode === "cloud_custom" ? <IconKey size={18} /> : <IconLock size={18} />}
                </span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span className="settings-mode-card-label">{m.label}</span>
                  <span className="settings-mode-card-desc">{m.desc}</span>
                </div>
              </div>
              {m.highlight && llmMode === m.mode && (
                <span className="settings-mode-badge">Khuyên dùng</span>
              )}
            </button>
          ))}
        </div>

        {/* Cloud Free stats */}
        {llmMode === "cloud_free" && (
          <div className="settings-mode-detail" style={{ marginTop: 16 }}>
            <div style={{ background: "rgba(var(--color-primary-rgb), 0.05)", border: "1px solid rgba(var(--color-primary-rgb), 0.15)", borderRadius: "8px", padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <IconZap size={16} /> Lượt sử dụng miễn phí
                </span>
                {/* <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Hạn mức hệ thống tự động đặt lại mỗi ngày</span> */}
              </div>
              <div style={{ textAlign: "right" }}>
                {usage ? (
                  <>
                    <strong style={{ fontSize: "1.2rem", color: "var(--color-primary)" }}>{usage.used} / {usage.limit}</strong>
                    <span style={{ display: "block", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>câu hỏi đã dùng</span>
                  </>
                ) : (
                  <span>Đang tải...</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Custom Cloud settings */}
        {llmMode === "cloud_custom" && (
          <div className="settings-mode-detail" style={{ marginTop: 16 }}>
            <div className="provider-tabs" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
              {["deepseek", "gemini", "claude", "groq", "nvidia", "github", "freemodel"].map((provider) => {
                const isActive = customCloudProvider === provider;
                const labels: Record<string, string> = {
                  deepseek: "DeepSeek",
                  gemini: "Gemini",
                  claude: "Claude",
                  groq: "Groq",
                  nvidia: "Nvidia NIM",
                  github: "GitHub Models",
                  freemodel: "FreeModel"
                };
                return (
                  <button
                    key={provider}
                    className="provider-tab-btn"
                    onClick={() => setCustomCloudProvider(provider as any)}
                    style={{
                      flex: "1 1 30%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color, #e2e8f0)",
                      background: isActive ? "rgba(var(--color-primary-rgb), 0.1)" : "transparent",
                      borderColor: isActive ? "var(--color-primary)" : "var(--border-color)",
                      color: isActive ? "var(--color-primary)" : "var(--color-text)",
                      cursor: "pointer", fontWeight: "bold", minWidth: "100px", fontSize: "0.85rem"
                    }}
                  >
                    {labels[provider]}
                  </button>
                );
              })}
            </div>

            {customCloudProvider === "deepseek" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">DeepSeek API Key</label>
                  <div className="settings-api-key-row">
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="settings-input"
                      value={deepseekApiKey}
                      onChange={(e) => setDeepseekApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                    <button
                      className="settings-toggle-key-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Ẩn key" : "Hiện key"}
                    >
                      {showApiKey ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    🔒 API key được lưu trên máy bạn, không gửi đi đâu.
                    <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}Lấy key tại đây →
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">DeepSeek Model</label>
                  <select className="settings-select" value={deepseekModel} onChange={(e) => setDeepseekModel(e.target.value)}>
                    <option value="deepseek-chat">deepseek-chat (cân bằng, nhanh, thông minh)</option>
                    <option value="deepseek-reasoner">deepseek-reasoner (suy nghĩ sâu, RAG tốt)</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "gemini" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">Gemini API Key</label>
                  <div className="settings-api-key-row">
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="settings-input"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="AIzaSy..."
                    />
                    <button
                      className="settings-toggle-key-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Ẩn key" : "Hiện key"}
                    >
                      {showApiKey ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    🔒 API key được lưu trên máy bạn, không gửi đi đâu.
                    <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}Lấy key tại đây →
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">Gemini Model</label>
                  <select className="settings-select" value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (nhanh, nhẹ, context cực lớn)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash (thế hệ mới, rất thông minh)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (mạnh mẽ, phân tích tốt)</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "claude" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">Claude API Key</label>
                  <div className="settings-api-key-row">
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="settings-input"
                      value={claudeApiKey}
                      onChange={(e) => setClaudeApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                    />
                    <button
                      className="settings-toggle-key-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Ẩn key" : "Hiện key"}
                    >
                      {showApiKey ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    🔒 API key được lưu trên máy bạn, không gửi đi đâu.
                    <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}Lấy key tại đây →
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">Claude Model</label>
                  <select className="settings-select" value={claudeModel} onChange={(e) => setClaudeModel(e.target.value)}>
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (cân bằng)</option>
                    <option value="claude-haiku-3-5-20241022">Claude Haiku 3.5 (nhanh, rẻ)</option>
                    <option value="claude-opus-4-20250514">Claude Opus 4 (mạnh nhất)</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "groq" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">Groq API Key</label>
                  <div className="settings-api-key-row">
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="settings-input"
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
                      placeholder="gsk-..."
                    />
                    <button
                      className="settings-toggle-key-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Ẩn key" : "Hiện key"}
                    >
                      {showApiKey ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    🔒 API key được lưu trên máy bạn.
                    <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}Lấy key tại đây →
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">Groq Model</label>
                  <select className="settings-select" value={groqModel} onChange={(e) => setGroqModel(e.target.value)}>
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (cực nhanh, nhẹ)</option>
                    <option value="llama-3.3-70b-specdec">llama-3.3-70b-specdec (mạnh mẽ, thông minh)</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768 (context lớn)</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "nvidia" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">Nvidia NIM API Key</label>
                  <div className="settings-api-key-row">
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="settings-input"
                      value={nvidiaApiKey}
                      onChange={(e) => setNvidiaApiKey(e.target.value)}
                      placeholder="nvapi-..."
                    />
                    <button
                      className="settings-toggle-key-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Ẩn key" : "Hiện key"}
                    >
                      {showApiKey ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    🔒 API key được lưu trên máy bạn.
                    <a href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}Lấy key tại đây →
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">Nvidia NIM Model</label>
                  <select className="settings-select" value={nvidiaModel} onChange={(e) => setNvidiaModel(e.target.value)}>
                    <option value="moonshotai/kimi-k2.6">moonshotai/kimi-k2.6 (tốt cho tiếng Việt)</option>
                    <option value="deepseek-ai/deepseek-v3">deepseek-ai/deepseek-v3 (thông minh, đa năng)</option>
                    <option value="meta/llama-3.3-70b-instruct">meta/llama-3.3-70b-instruct (phân tích tốt)</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "freemodel" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">FreeModel API Key</label>
                  <div className="settings-api-key-row">
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="settings-input"
                      value={freemodelApiKey}
                      onChange={(e) => setFreemodelApiKey(e.target.value)}
                      placeholder="fm-..."
                    />
                    <button
                      className="settings-toggle-key-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Ẩn key" : "Hiện key"}
                    >
                      {showApiKey ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    🔒 API key được lưu trên máy bạn.
                    <a href="https://freemodel.dev/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}Lấy key tại đây →
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">FreeModel Model</label>
                  <select className="settings-select" value={freemodelModel} onChange={(e) => setFreemodelModel(e.target.value)}>
                    <option value="gpt-4o-mini">gpt-4o-mini (tiêu chuẩn, nhanh)</option>
                    <option value="claude-3-5-haiku">claude-3-5-haiku (thông minh)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (linh hoạt)</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "github" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">GitHub Personal Access Token</label>
                  <div className="settings-api-key-row">
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="settings-input"
                      value={githubApiKey}
                      onChange={(e) => setGithubApiKey(e.target.value)}
                      placeholder="github_pat_... or ghp_..."
                    />
                    <button
                      className="settings-toggle-key-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Ẩn key" : "Hiện key"}
                    >
                      {showApiKey ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    🔒 Token được lưu trên máy bạn, không gửi đi đâu.
                    <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}Lấy token tại đây →
                    </a>
                    <br />
                    Cần cấp quyền <strong>AI Models (Read-only)</strong> trong phần Account permissions.
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">GitHub Model</label>
                  <select className="settings-select" value={githubModel} onChange={(e) => setGithubModel(e.target.value)}>
                    <option value="gpt-4o-mini">gpt-4o-mini (nhẹ, nhanh, miễn phí)</option>
                    <option value="microsoft/gpt-4o-mini">microsoft/gpt-4o-mini (full path)</option>
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {/* Local settings */}
        {llmMode === "local" && (
          <div className="settings-mode-detail">
            <div className="settings-field" style={{ marginTop: 16 }}>
              <label className="settings-label">llama-server URL</label>
              <input
                type="text"
                className="settings-input"
                value={llamaServerUrl}
                onChange={(e) => setLlamaServerUrl(e.target.value)}
                placeholder="http://127.0.0.1:8080"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Tên model (GGUF)</label>
              <input
                type="text"
                className="settings-input"
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
                placeholder="Qwen3-4B-Q4_K_M.gguf"
              />
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", marginTop: 8 }}>
              Khởi chạy CPU: <code>llama-server.exe -m path/to/{localModel} --port 8080 -c 4096 -np 1 -t 6 --cache-ram 1024</code>
            </p>
            <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", marginTop: 8 }}>
              Tải tại 
              <a href="#" onClick={(e) => { e.preventDefault(); open("https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/tree/main"); }} style={{ marginLeft: 4 }}>
                https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/tree/main
              </a>
            </p>
          </div>
        )}

        <div className="settings-actions" style={{ marginTop: 16 }}>
          <button className="settings-save-btn" onClick={saveSettings} disabled={saving}>
            {saving ? <IconSpinner size={16} /> : <IconCheck size={16} />}
            <span>{saving ? "Đang lưu..." : "Lưu cấu hình"}</span>
          </button>
          {saveMsg && (
            <span className="settings-save-msg" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: saveMsg.type === "success" ? "var(--color-success)" : "var(--color-error)" }}>
              {saveMsg.type === "success" ? (
                saveMsg.text.includes("Đang kiểm tra") ? <IconSpinner size={14} /> : <IconCheck size={14} />
              ) : (
                <IconError size={14} />
              )}
              {saveMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* ── Data Management ────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <IconFolder size={18} className="icon-gradient" />
          Quản lý dữ liệu
        </h3>
        
        <div className="settings-storage-box">
          <div className="settings-storage-info">
            <span className="settings-storage-label">Thư mục lưu trữ:</span>
            <code className="settings-storage-path">
              {stats?.data_dir || "Đang tải..."}
            </code>
            <p className="settings-storage-hint">
              Nơi lưu trữ cơ sở dữ liệu SQLite, vector ChromaDB và các tài liệu PDF đã import của bạn.
            </p>
          </div>
          
          <div className="settings-storage-actions">
            <button className="settings-btn-secondary" onClick={handleOpenFolder} disabled={actionLoading}>
              <IconFolderOpen size={16} /> Mở thư mục
            </button>
            <button className="settings-btn-secondary" onClick={handleChangeStoragePath} disabled={actionLoading}>
              <IconFolder size={16} /> Di chuyển thư mục
            </button>
            <button className="settings-btn-danger-outline" onClick={handleClearData} disabled={actionLoading}>
              <IconTrash size={16} /> Xoá dữ liệu tài liệu
            </button>
            <button className="settings-btn-danger" onClick={handleResetApp} disabled={actionLoading}>
              <IconRefresh size={16} /> Reset ứng dụng
            </button>
          </div>
          
          {storageMsg && (
            <div className={`settings-storage-msg ${storageMsg.type}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: storageMsg.type === "success" ? "var(--color-success)" : "var(--color-error)" }}>
              {storageMsg.type === "success" ? <IconCheck size={14} /> : <IconError size={14} />}
              <span>{storageMsg.text}</span>
            </div>
          )}

          {/* Zotero Sync settings */}
          <div className="settings-storage-info" style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
            <span className="settings-storage-label" style={{ fontWeight: 600 }}>Tích hợp thư viện Zotero (SQLite):</span>
            <p className="settings-storage-hint" style={{ marginBottom: 12 }}>
              Đồng bộ tự động các tài liệu và tệp PDF từ thư mục dữ liệu Zotero cục bộ của bạn.
            </p>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", marginBottom: "8px" }}>
              <input
                type="text"
                className="settings-input"
                value={zoteroDataDir}
                onChange={(e) => setZoteroDataDir(e.target.value)}
                placeholder="Đường dẫn đến thư mục Zotero data (chứa zotero.sqlite)..."
                style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
              />
              <button 
                className="settings-btn-secondary" 
                onClick={handleSelectZoteroPath}
                style={{ padding: "6px 12px", fontSize: "0.85rem", whiteSpace: "nowrap" }}
              >
                📁 Chọn thư mục
              </button>
              <button 
                className="settings-btn-secondary" 
                onClick={handleDetectZotero}
                style={{ padding: "6px 12px", fontSize: "0.85rem", whiteSpace: "nowrap" }}
              >
                ⚡ Tự động tìm
              </button>
            </div>
          </div>

          <div className="settings-storage-info" style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
            <span className="settings-storage-label" style={{ fontWeight: 600 }}>Bộ nhớ đệm offline (Cache):</span>
            <p className="settings-storage-hint" style={{ marginBottom: 8 }}>
              Lưu giữ các kết quả Embedding và câu trả lời LLM để tăng tốc độ truy xuất không độ trễ (&lt; 5ms).
            </p>
            <div style={{ display: "flex", gap: "16px", marginTop: "8px", marginBottom: "8px" }}>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", padding: "8px 12px", borderRadius: "var(--radius-md)" }}>
                <span style={{ display: "block", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Câu trả lời AI</span>
                <strong>{cacheStats?.llm_cache_count ?? 0} bản ghi</strong>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", padding: "8px 12px", borderRadius: "var(--radius-md)" }}>
                <span style={{ display: "block", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Vector Embedding</span>
                <strong>{cacheStats?.embedding_cache_count ?? 0} bản ghi</strong>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" }}>
              <button 
                className="settings-btn-secondary" 
                onClick={handleClearCache} 
                disabled={actionLoading || clearingCache}
                style={{ padding: "6px 12px", fontSize: "0.85rem" }}
              >
                {clearingCache ? <IconSpinner size={14} /> : <IconTrash size={14} />}
                <span>{clearingCache ? "Đang xoá..." : "Xoá bộ nhớ đệm"}</span>
              </button>
              {cacheMsg && (
                <span style={{ fontSize: "0.85rem", color: "var(--color-success)" }}>
                  {cacheMsg}
                </span>
              )}
            </div>
          </div>

          <div className="settings-storage-info" style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
            <span className="settings-storage-label" style={{ fontWeight: 600 }}>Quản lý Tài nguyên & Tiết kiệm Điện (Power Saver):</span>
            <p className="settings-storage-hint" style={{ marginBottom: 12 }}>
              Tự động giải phóng bộ nhớ RAM/VRAM của các mô hình AI cục bộ sau 5 phút không hoạt động để tối ưu hiệu năng máy tính.
            </p>
            
            {modelStatus && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--color-bg-hover, #f8fafc)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Mô hình Embedding</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{modelStatus.embedder.model_name || "bge-m3"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {modelStatus.embedder.loaded ? (
                      <>
                        <span style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e", padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600 }}>🟢 Hoạt động</span>
                        <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>Chờ: {modelStatus.embedder.idle_seconds}s</span>
                      </>
                    ) : (
                      <span style={{ background: "rgba(148, 163, 184, 0.1)", color: "#94a3b8", padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600 }}>💤 Tạm dừng</span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--color-bg-hover, #f8fafc)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Mô hình Reranker</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{modelStatus.reranker.model_name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {modelStatus.reranker.loaded ? (
                      <>
                        <span style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e", padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600 }}>🟢 Hoạt động</span>
                        <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>Chờ: {modelStatus.reranker.idle_seconds}s</span>
                      </>
                    ) : (
                      <span style={{ background: "rgba(148, 163, 184, 0.1)", color: "#94a3b8", padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600 }}>💤 Tạm dừng</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Provider Routing ────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <IconZap size={18} /> Định tuyến Provider
        </h3>
        <p className="settings-desc">
          Cấu hình provider cho từng tác vụ AI. Khi provider chính gặp lỗi, hệ thống tự động chuyển sang fallback.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Tác vụ</th>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Provider chính</th>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Fallback</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const primaryMap: Record<string, string> = (() => {
                  try { return JSON.parse(taskProviderMapStr); } catch { return {}; }
                })();
                const fallbackMap: Record<string, string> = (() => {
                  try { return JSON.parse(taskFallbackMapStr); } catch { return {}; }
                })();

                const handleChangePrimary = (task: string, provider: string) => {
                  const newMap = { ...primaryMap, [task]: provider };
                  setTaskProviderMapStr(JSON.stringify(newMap, null, 2));
                };
                const handleChangeFallback = (task: string, provider: string) => {
                  const newMap = { ...fallbackMap, [task]: provider };
                  setTaskFallbackMapStr(JSON.stringify(newMap, null, 2));
                };

                return ALL_TASKS.map((task) => (
                  <tr key={task}>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--color-border)", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {TASK_LABELS[task] || task}
                    </td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--color-border)" }}>
                      <select
                        value={primaryMap[task] || ""}
                        onChange={(e) => handleChangePrimary(task, e.target.value)}
                        style={{
                          width: "100%", minWidth: "120px", padding: "4px 6px", fontSize: "0.78rem",
                          background: "var(--color-surface)", border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-sm)", color: "var(--color-text)", cursor: "pointer",
                        }}
                      >
                        <option value="">— Mặc định —</option>
                        {ALL_PROVIDERS.map((prov) => (
                          <option key={prov} value={prov}>{PROVIDER_LABELS[prov]}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--color-border)" }}>
                      <select
                        value={fallbackMap[task] || ""}
                        onChange={(e) => handleChangeFallback(task, e.target.value)}
                        style={{
                          width: "100%", minWidth: "120px", padding: "4px 6px", fontSize: "0.78rem",
                          background: "var(--color-surface)", border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-sm)", color: "var(--color-text)", cursor: "pointer",
                        }}
                      >
                        <option value="">— Không có —</option>
                        {ALL_PROVIDERS.map((prov) => (
                          <option key={prov} value={prov}>{PROVIDER_LABELS[prov]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>

        <details style={{ marginTop: 12, fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
          <summary style={{ cursor: "pointer", userSelect: "none" }}>
            Xem JSON gốc
          </summary>
          <div style={{ marginTop: 8 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>task_provider_map</label>
            <textarea
              value={taskProviderMapStr}
              onChange={(e) => setTaskProviderMapStr(e.target.value)}
              rows={4}
              style={{
                width: "100%", fontSize: "0.72rem", fontFamily: "monospace",
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)", color: "var(--color-text)",
                padding: "6px 8px", resize: "vertical",
              }}
            />
            <label style={{ display: "block", margin: "8px 0 4px", fontWeight: 600 }}>task_fallback_map</label>
            <textarea
              value={taskFallbackMapStr}
              onChange={(e) => setTaskFallbackMapStr(e.target.value)}
              rows={4}
              style={{
                width: "100%", fontSize: "0.72rem", fontFamily: "monospace",
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)", color: "var(--color-text)",
                padding: "6px 8px", resize: "vertical",
              }}
            />
          </div>
        </details>
      </div>

      {/* ── System Info ───────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <IconSparkle size={18} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
          Hệ thống
        </h3>
        <div className="settings-about">
          <p>Phiên bản: <strong>0.6.0</strong></p>
          <p>Phát triển bởi: <strong>Viu Gia Lai</strong></p>
          <p>
            Chế độ AI:{" "}
            <strong style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              {llmMode === "cloud_free" ? (
                <>
                  <IconZap size={14} /> Cloud Free
                </>
              ) : llmMode === "cloud_custom" ? (
                <>
                  <IconKey size={14} /> Custom Cloud ({
                    customCloudProvider === "deepseek" ? "DeepSeek"
                    : customCloudProvider === "gemini" ? "Gemini"
                    : customCloudProvider === "claude" ? "Claude"
                    : customCloudProvider === "groq" ? "Groq"
                    : customCloudProvider === "nvidia" ? "Nvidia NIM"
                    : customCloudProvider === "github" ? "GitHub Models"
                    : "FreeModel"
                  })
                </>
              ) : (
                <>
                  <IconLock size={14} /> Local (llama-server)
                </>
              )}
            </strong>
          </p>
          <p>
            Embedding:{" "}
            <strong>
              {embeddingMode === "cloud"
                ? `☁️ Gemini`
                : `💻 ${embeddingModel || "bge-m3"} (local)`}
            </strong>
            <span style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <select
                value={embeddingMode}
                onChange={async (e) => {
                  const newMode = e.target.value;
                  setEmbeddingMode(newMode);
                  setEmbeddingTestResult(null);
                  setEmbeddingTestMsg("");
                  // Auto-save ngay khi đổi dropdown
                  try {
                    await api.updateSettings({ embedding_mode: newMode });
                  } catch { /* silent */ }
                }}
                style={{
                  fontSize: "0.75rem",
                  padding: "1px 4px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                <option value="local">Local</option>
                <option value="cloud">Cloud Gemini</option>
              </select>
              {embeddingMode === "cloud" && (
                <button
                  onClick={testEmbedding}
                  disabled={testingEmbedding}
                  title="Kiểm tra kết nối Gemini Embedding"
                  style={{
                    fontSize: "0.7rem",
                    padding: "2px 6px",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: embeddingTestResult === "success" ? "var(--color-success)" : embeddingTestResult === "error" ? "var(--color-error)" : "var(--color-text-muted)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {testingEmbedding ? "⏳" : embeddingTestResult === "success" ? "✅ OK" : embeddingTestResult === "error" ? "❌ Lỗi" : "Kết nối"}
                </button>
              )}
              {embeddingTestMsg && (
                <span style={{
                  fontSize: "0.7rem",
                  color: embeddingTestResult === "success" ? "var(--color-success)" : "var(--color-error)",
                  marginLeft: 4,
                }}>
                  {embeddingTestMsg}
                </span>
              )}
            </span>
          </p>
          <p>
            MMR:{" "}
            <strong>
              {mmrLambda !== "" ? `🔄 λ=${mmrLambda}` : "⏭️ Tắt"}
            </strong>
          </p>
          <p style={{ marginTop: 4 }}>
            Reranker:{" "}
            <strong>
              {enableReranker ? "🔌 Bật (Chậm, chính xác hơn)" : "⚡ Tắt (Nhanh, nhẹ)"}
            </strong>
            <span style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <select
                value={enableReranker ? "true" : "false"}
                onChange={async (e) => {
                  const val = e.target.value === "true";
                  setEnableReranker(val);
                  try {
                    await api.updateSettings({ enable_reranker: val });
                  } catch { /* silent */ }
                }}
                style={{
                  fontSize: "0.75rem",
                  padding: "1px 4px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                <option value="false">Tắt (Tốc độ cao)</option>
                <option value="true">Bật (Chính xác cao)</option>
              </select>
            </span>
          </p>
          {embeddingMode === "local" && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                Hướng dẫn Embedding (query instruction)
              </label>
              <input
                type="text"
                value={embeddingQueryInstruction}
                onChange={e => setEmbeddingQueryInstruction(e.target.value)}
                placeholder="VD: Hãy biểu diễn câu hỏi này để tìm kiếm tài liệu: "
                style={{
                  fontSize: "0.75rem", padding: "4px 8px",
                  background: "var(--color-surface)", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)", color: "var(--color-text)",
                  width: "100%", maxWidth: 500,
                }}
              />
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 4 }}>
                Hướng dẫn Passage (passage instruction)
              </label>
              <input
                type="text"
                value={embeddingPassageInstruction}
                onChange={e => setEmbeddingPassageInstruction(e.target.value)}
                placeholder="VD: Hãy biểu diễn đoạn văn này: "
                style={{
                  fontSize: "0.75rem", padding: "4px 8px",
                  background: "var(--color-surface)", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)", color: "var(--color-text)",
                  width: "100%", maxWidth: 500,
                }}
              />
              <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
                {embeddingQueryInstruction || embeddingPassageInstruction
                  ? `Dùng ${embeddingQueryInstruction ? "query + " : ""}${embeddingPassageInstruction ? "passage" : ""} instruction cho RAG`
                  : "Để trống = không dùng instruction (mặc định)"}
              </span>
              <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  Pooling:
                  <select
                    value={embeddingPooling}
                    onChange={e => setEmbeddingPooling(e.target.value)}
                    style={{ fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)", cursor: "pointer" }}
                  >
                    <option value="cls">CLS</option>
                    <option value="mean">Mean</option>
                    <option value="last_token">Last Token</option>
                  </select>
                </label>
                <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={normalizeEmbeddings}
                    onChange={e => setNormalizeEmbeddings(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  Normalize embeddings
                </label>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  MMR diversity:
                  <input
                    type="number"
                    value={mmrLambda}
                    onChange={e => setMmrLambda(e.target.value)}
                    placeholder="Tắt"
                    min={0} max={1} step={0.05}
                    style={{ width: 70, fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)" }}
                  />
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>
                    (0=đa dạng, 1=liên quan, để trống=tắt)
                  </span>
                </label>
              </div>
            </div>
          )}
          <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Model Router
            </span>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 8 }}>
              Tự động chuyển sang model context lớn khi vượt ngưỡng token (open-notebook inspired)
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                Ngưỡng context:
                <input
                  type="number"
                  value={largeContextThreshold}
                  onChange={e => setLargeContextThreshold(Number(e.target.value))}
                  style={{ width: 80, fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)" }}
                  min={1000} max={500000} step={1000}
                />
                tokens
              </label>
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                Fallback model:
                <input
                  type="text"
                  value={largeContextModel}
                  onChange={e => setLargeContextModel(e.target.value)}
                  placeholder="claude-sonnet-4-20250514"
                  style={{ width: 160, fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)" }}
                />
              </label>
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                Provider:
                <select
                  value={largeContextProvider}
                  onChange={e => setLargeContextProvider(e.target.value)}
                  style={{ fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)", cursor: "pointer" }}
                >
                  <option value="">Mặc định</option>
                  <option value="claude">Claude</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="gemini">Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="nvidia">Nvidia NIM</option>
                  <option value="local">Local</option>
                </select>
              </label>
            </div>
          </div>
          {stats && (
            <>
              <p>Papers: <strong>{stats.total_papers}</strong></p>
              <p>Chunks (SQLite): <strong>{stats.total_chunks}</strong></p>
              <p>Chunks (ChromaDB): <strong>{stats.chroma_chunks}</strong></p>
            </>
          )}
          <p style={{ marginTop: 16, color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            <IconLock size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Dữ liệu hoàn toàn trên máy bạn. Không gửi ra ngoài nếu không được phép.
          </p>
          <div className="settings-about-links">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><IconLock size={12} /> Local First</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><IconSparkle size={12} /> Cho nghiên cứu sinh</span>
            <span>Tiếng Việt</span>
            <span>PDF</span>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};
