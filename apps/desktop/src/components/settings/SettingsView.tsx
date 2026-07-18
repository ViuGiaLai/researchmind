import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, BASE_URL } from "../../lib/api";
import {
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from "../../lib/theme";
import { LanguageSwitcher } from "../shared/LanguageSwitcher";
import { LicensePanel } from "./LicensePanel";
import { PrivacyCenter } from "./PrivacyCenter";
import { open } from "@tauri-apps/plugin-shell";
import {
  IconBrain,
  IconCheck,
  IconError,
  IconSearch,
  IconSpinner,
  IconSparkle,
  IconLock,
  IconZap,
  IconKey,
  IconMonitor,
  IconSun,
  IconMoon,
  IconFolder,
  IconFolderOpen,
  IconRefresh,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconCloud,
  IconLaptop,
  IconRotateCcw,
  IconSkipForward,
  IconPlug,
  IconCircle,
  IconPauseCircle,
  IconWithText,
  IconBookOpen,
  IconHelp,
  IconInfo,
  IconActivity,
  IconCopy,
  IconRocket,
} from "../Icons";
import { resetWelcomeTourSeen } from "../help/WelcomeTour";
import type { DiagnosticsResponse } from "../../lib/api";
import { SubTabBar } from "../shared/SubTabBar";
import type { HelpSectionId } from "../help/helpContent";
import { useConfirmDialog } from "../shared/ConfirmDialog";

interface SettingsViewProps {
  onOpenHelp?: (section: HelpSectionId) => void;
  onStartTour?: () => void;
  onReplaySetup?: () => void;
}


type LlmMode = "cloud_free" | "cloud_custom" | "local";

interface SpecsResult {
  total_ram_gb: number;
  cpu_cores: number;
  suggested_tier: string;
  suggested_model: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenHelp, onStartTour, onReplaySetup }) => {
  const { t } = useTranslation();
  const { confirm, confirmationDialog } = useConfirmDialog();
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
  type HealthStatusKey = "not_checked" | "checking" | "connected" | "not_responding" | "cannot_connect";
  const [healthStatusKey, setHealthStatusKey] = useState<HealthStatusKey>("not_checked");
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
    "github", "gemini", "deepseek", "nvidia_deepseek", "groq", "nvidia", "freemodel",
    "claude", "openrouter", "cohere", "cloudflare", "cerebras", "local",
  ] as const;
  const PROVIDER_LABELS: Record<string, string> = {
    github: "GitHub Models", gemini: "Gemini", deepseek: "DeepSeek",
    nvidia_deepseek: "NVIDIA DeepSeek", groq: "Groq", nvidia: "Nvidia NIM",
    freemodel: "FreeModel", claude: "Claude", openrouter: "OpenRouter",
    cohere: "Cohere", cloudflare: "Cloudflare", cerebras: "Cerebras", local: "Local",
  };
  const TASK_LABELS: Record<string, string> = {
    summary: t("chat.quick_summary"), daily_reader: t("labs.daily_read"), chat: t("nav.chat"),
    quality_check: t("settings.advanced_quality_check"), insight: t("settings.advanced_insight"),
    entity: t("settings.advanced_entity"), rag: t("settings.advanced_rag"),
    critique: t("settings.advanced_critique"), verify: t("settings.advanced_verify"), gap: t("settings.advanced_gap"),
    debate: t("settings.advanced_debate"), review: t("nav.review"),
    research: t("settings.advanced_research"), synthesis: t("settings.advanced_synthesis"), graph: t("settings.advanced_graph"),
  };
  const [taskProviderMapStr, setTaskProviderMapStr] = useState("{}");
  const [taskFallbackMapStr, setTaskFallbackMapStr] = useState("{}");

  // ── Theme State ──────────────────────────────────────────────
  const [themePref, setThemePref] = useState<ThemePreference>(() => getThemePreference());

  const selectTheme = (pref: ThemePreference) => {
    setThemePref(pref);
    setThemePreference(pref);
  };

  // ── Data Management State ─────────────────────────────────────
  const [actionLoading, setActionLoading] = useState(false);
  const [storageMsg, setStorageMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [zoteroDataDir, setZoteroDataDir] = useState("");

  // ── Cache State ───────────────────────────────────────────────
  const [cacheStats, setCacheStats] = useState<{ llm_cache_count: number; embedding_cache_count: number } | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);

  // ── Diagnostics State ────────────────────────────────────────
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagMsg, setDiagMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [rebuildingFts, setRebuildingFts] = useState(false);

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
      setGeminiModel(s.gemini_model || "");
      setGroqApiKey((s as any).groq_api_key === "***" ? "" : (s as any).groq_api_key || "");
      setGroqModel((s as any).groq_model || "");
      setNvidiaApiKey((s as any).nvidia_api_key === "***" ? "" : (s as any).nvidia_api_key || "");
      setNvidiaModel((s as any).nvidia_model || "");
      setFreemodelApiKey((s as any).freemodel_api_key === "***" ? "" : (s as any).freemodel_api_key || "");
      setFreemodelModel((s as any).freemodel_model || "");
      setGithubApiKey((s as any).github_api_key === "***" ? "" : (s as any).github_api_key || "");
      setGithubModel((s as any).github_model || "");
      setCustomCloudProvider((s.custom_cloud_provider as CustomProvider) || "");
      setLlamaServerUrl((s as any).llama_server_url || "");
      setLocalModel((s as any).local_model || "");
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
        setEmbeddingTestMsg(res.message || t("settings.embedding_test_success"));
      } else {
        setEmbeddingTestResult("error");
        setEmbeddingTestMsg(res.error || t("settings.embedding_test_fail"));
      }
    } catch (e) {
      setEmbeddingTestResult("error");
      setEmbeddingTestMsg(e instanceof Error ? e.message : t("settings.embedding_backend_error"));
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
      setStorageMsg({ type: "success", text: res.message || t("settings.storage_opened") });
    } catch (e) {
      setStorageMsg({ type: "error", text: e instanceof Error ? e.message : t("settings.storage_open_error") });
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
      setStorageMsg({ type: "success", text: t("settings.storage_checking") });
      const space = await api.getDiskSpace(selected);
      
      let confirmMsg = t("settings.move_storage_confirm", { path: selected, free_gb: space.free_gb });
      if (space.warning) {
        confirmMsg = t("settings.move_storage_confirm_warning", { path: selected, free_gb: space.free_gb });
      }
      
      const proceed = await confirm(confirmMsg, { destructive: space.warning });
      if (!proceed) {
        setStorageMsg(null);
        return;
      }
      
      // 2. Perform moving storage
      setActionLoading(true);
      setStorageMsg({ type: "success", text: t("settings.storage_moving") });
      
      const res = await api.moveStorage(selected);
      setStorageMsg({ type: "success", text: res.message || t("settings.storage_moved") });
      
      // 3. Reload stats to show new path
      loadStats();
    } catch (e) {
      setStorageMsg({ type: "error", text: e instanceof Error ? e.message : t("settings.storage_move_error") });
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
        setStorageMsg({ type: "success", text: t("settings.zotero_selected", { path: selected }) });
      }
    } catch (e) {
      console.error("Failed to select Zotero directory:", e);
      setStorageMsg({ type: "error", text: t("settings.zotero_select_error") });
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
      setStorageMsg({ type: "error", text: t("settings.zotero_detect_error", { error: e.message || e }) });
    }
  };

  const handleClearData = async () => {
    const confirmClear = await confirm(t("settings.data_clear_confirm"), { destructive: true });
    if (!confirmClear) return;

    setActionLoading(true);
    setStorageMsg(null);
    try {
      const res = await api.clearAllData();
      setStorageMsg({ type: "success", text: res.message || t("settings.data_cleared") });
      loadStats();
    } catch (e) {
      setStorageMsg({ type: "error", text: e instanceof Error ? e.message : t("settings.data_clear_error") });
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetApp = async () => {
    const confirmReset = await confirm(t("settings.data_reset_confirm"), { destructive: true });
    if (!confirmReset) return;

    setActionLoading(true);
    setStorageMsg(null);
    try {
      const res = await api.resetApp();
      setStorageMsg({ type: "success", text: res.message || t("settings.data_reset_success") });
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e) {
      setStorageMsg({ type: "error", text: e instanceof Error ? e.message : t("settings.data_reset_error") });
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

  const loadDiagnostics = async () => {
    setDiagLoading(true);
    setDiagMsg(null);
    try {
      const d = await api.getDiagnostics();
      setDiagnostics(d);
    } catch (e) {
      setDiagMsg({
        type: "error",
        text:        e instanceof Error ? e.message : t("settings.diag_load_system_error"),
      });
    } finally {
      setDiagLoading(false);
    }
  };

  const handleRebuildFts = async () => {
    const ok = await confirm(t("settings.fts_rebuild_confirm"));
    if (!ok) return;

    setRebuildingFts(true);
    setDiagMsg(null);
    try {
      const res = await api.rebuildFts();
      setDiagMsg({ type: "success", text: res.message });
      await loadDiagnostics();
    } catch (e) {
      setDiagMsg({
        type: "error",
        text:        e instanceof Error ? e.message : t("settings.rebuild_fts_error"),
      });
    } finally {
      setRebuildingFts(false);
    }
  };

  const handleCopyDiagnostics = async () => {
    if (!diagnostics) return;
    const lines = [
      t("settings.diag_report_header"),
      `Version: ${diagnostics.version}`,
      `Backend: ${diagnostics.backend_ready ? "OK" : "NOT READY"} — ${diagnostics.init_message}`,
      `Embedder: ${diagnostics.embedder_ready ? "OK" : "Warming up"}`,
      `LLM mode: ${diagnostics.llm_mode}`,
      t("settings.diag_papers_line", { total: diagnostics.total_papers, indexed: diagnostics.indexed_papers }),
      `Chunks: ${diagnostics.total_chunks} SQLite / ${diagnostics.chroma_chunks} Chroma`,
      `Chunk sync: ${diagnostics.chunk_sync_ok ? "OK" : "MISMATCH"}`,
      `Data: ${diagnostics.data_dir}`,
      `Disk free: ${diagnostics.disk.free_gb ?? "?"} GB`,
      `Cache: ${diagnostics.cache.llm_cache_count} LLM / ${diagnostics.cache.embedding_cache_count} embedding`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setDiagMsg({ type: "success", text: t("settings.diag_copy_success") });
    } catch {
      setDiagMsg({ type: "error", text: t("settings.diag_copy_error") });
    }
  };

  const handleReplayWelcomeTour = () => {
    resetWelcomeTourSeen();
    onStartTour?.();
    setDiagMsg({ type: "success", text: t("settings.diag_tour_launch") });
  };

  const handleReplaySetupWizard = async () => {
    if (!onReplaySetup) {
      setDiagMsg({ type: "error", text: t("settings.diag_wizard_unavailable") });
      return;
    }
    const ok = await confirm(t("settings.wizard_confirm"));
    if (!ok) return;
    onReplaySetup();
  };

  const diagStatus = (ok: boolean) => (ok ? "ok" : "warn");

  const handleClearCache = async () => {
    const confirmClear = await confirm(t("settings.confirm_clear_cache"), { destructive: true });
    if (!confirmClear) return;

    setClearingCache(true);
    setCacheMsg(null);
    try {
      const res = await api.clearCache();
      setCacheMsg(res.message || t("settings.cache_cleared"));
      loadCacheStats();
      loadDiagnostics();
    } catch (e) {
      alert(t("settings.clear_cache_failed", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setClearingCache(false);
    }
  };

  const healthStatusLabel: Record<HealthStatusKey, string> = {
    not_checked: t("settings.health_not_checked"),
    checking: t("settings.health_checking"),
    connected: t("settings.health_connected"),
    not_responding: t("settings.health_not_responding"),
    cannot_connect: t("settings.health_cannot_connect"),
  };

  const isHealthConnected = healthStatusKey === "connected";
  const isHealthError = healthStatusKey === "not_responding" || healthStatusKey === "cannot_connect";

  const checkHealth = async () => {
    setChecking(true);
    setHealthStatusKey("checking");
    setHealthColor("var(--color-text-muted)");
    try {
      const h = await api.health();
      if (h.status === "ok") {
        setHealthStatusKey("connected");
        setHealthColor("var(--color-success, #22c55e)");
      } else {
        setHealthStatusKey("not_responding");
        setHealthColor("var(--color-error, #ef4444)");
      }
    } catch {
      setHealthStatusKey("cannot_connect");
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
          setSaveMsg({ type: "success", text: t("settings.validate_connecting") });
          const val = await api.validateApiKey(customCloudProvider, activeKey, activeModel);
          if (!val.valid) {
            setSaveMsg({ type: "error", text: t("settings.validate_error", { error: val.error || t("error.unknown") }) });
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
      setSaveMsg({ type: "success", text: t("settings.save_success") });
      loadSettings();
      loadUsage();
    } catch (e) {
      setSaveMsg({ type: "error", text: t("settings.save_error", { error: e instanceof Error ? e.message : "Cannot save" }) });
    } finally {
      setSaving(false);
    }
  };

  const modeSuggestions = specs
    ? [
        { mode: "cloud_free" as LlmMode, label: t("settings.ai_cloud_free"), desc: t("settings.ai_cloud_free_desc"), highlight: true },
        { mode: "cloud_custom" as LlmMode, label: t("settings.ai_cloud_custom"), desc: t("settings.ai_cloud_custom_desc"), highlight: false },
        { mode: "local" as LlmMode, label: t("settings.ai_local"), desc: t("settings.ai_local_desc", { gb: specs.suggested_tier === "weak" ? "2" : specs.suggested_tier === "medium" ? "2" : "8" }), highlight: false },
      ]
    : [];

  type SettingsSection = "general" | "privacy" | "diagnostics" | "ai" | "data" | "advanced";
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  const settingsTabs = [
    { key: "general" as const, label: t("settings.section_general"), icon: IconMonitor },
    { key: "privacy" as const, label: t("privacy.title"), icon: IconLock },
    { key: "diagnostics" as const, label: t("settings.section_diagnostics"), icon: IconActivity },
    { key: "ai" as const, label: t("settings.section_ai"), icon: IconBrain },
    { key: "data" as const, label: t("settings.section_data"), icon: IconFolder },
    { key: "advanced" as const, label: t("settings.section_advanced"), icon: IconZap },
  ];

  const sectionMeta: Record<SettingsSection, { desc: string }> = {
    general: {
      desc: t("settings.section_general_desc"),
    },
    privacy: {
      desc: t("privacy.description"),
    },
    diagnostics: {
      desc: t("settings.section_diagnostics_desc"),
    },
    ai: {
      desc: t("settings.section_ai_desc"),
    },
    data: {
      desc: t("settings.section_data_desc"),
    },
    advanced: {
      desc: t("settings.section_advanced_desc"),
    },
  };

  useEffect(() => {
    if (activeSection === "diagnostics") {
      loadDiagnostics();
    }
  }, [activeSection]);

  return (
    <div className="settings-view">
      {confirmationDialog}
      <div className="settings-shell">
        <header className="settings-toolbar">
          <div className="settings-toolbar-text">
            <h2 className="settings-page-title">{t("settings.title")}</h2>
            <p className="settings-page-desc">{sectionMeta[activeSection].desc}</p>
            <p className="settings-page-desc" style={{ marginTop: 4, fontSize: "0.8rem", opacity: 0.88 }}>
              {t("app.tagline")}
            </p>
          </div>
          <div className="settings-toolbar-meta">
            {stats && (
              <span className="settings-meta-chip">{t("settings.stats_papers", { count: stats.total_papers })}</span>
            )}
            <span className="settings-meta-chip">v0.6.0</span>
            {activeSection === "ai" && (
              <button
                type="button"
                className="settings-save-btn settings-save-btn--header"
                onClick={saveSettings}
                disabled={saving}
              >
                {saving ? <IconSpinner size={16} /> : <IconCheck size={16} />}
                <span>{saving ? t("common.loading") : t("common.save")}</span>
              </button>
            )}
          </div>
        </header>

        <SubTabBar
          tabs={settingsTabs}
          active={activeSection}
          onChange={setActiveSection}
          variant="underline"
        />

        <div className="settings-content">
            {activeSection === "privacy" && <PrivacyCenter />}
            {activeSection === "general" && (
              <div className="settings-general-grid">
      <LicensePanel />
      <div className="settings-section settings-section--span">
        <h3 className="settings-section-title">
          <IconBrain size={18} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
          {t("settings.backend_title")}
        </h3>
        <div className="settings-health" style={{ borderColor: healthColor }}>
          <div className="settings-health-indicator" style={{ background: healthColor }} />
          <div className="settings-health-info">
            <span className="settings-health-label" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {checking ? (
                <IconSpinner size={14} />
              ) : isHealthConnected ? (
                <IconCheck size={14} style={{ color: "var(--color-success, #22c55e)" }} />
              ) : isHealthError ? (
                <IconError size={14} style={{ color: "var(--color-error, #ef4444)" }} />
              ) : null}
              {healthStatusLabel[healthStatusKey]}
            </span>
            <span className="settings-health-hint">
              FastAPI backend: {BASE_URL}
            </span>
          </div>
          <button className="settings-health-btn" onClick={checkHealth} disabled={checking}>
            {checking ? <IconSpinner size={16} /> : <IconSearch size={16} />}
            <span>{t("common.retry")}</span>
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">
          <IconSparkle size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          {t("settings.theme_title")}
        </h3>
        <div className="settings-field">
          <label className="settings-label">{t("settings.theme_label")}</label>
          <p className="settings-desc" style={{ marginBottom: 10 }}>
            {t("settings.theme_desc")}
          </p>
          <div className="settings-theme-options" role="group" aria-label={t("settings.theme_label")}>
            <button
              type="button"
              className={`settings-theme-option${themePref === "light" ? " active" : ""}`}
              onClick={() => selectTheme("light")}
            >
              <IconSun size={16} />
              {t("settings.theme_light")}
            </button>
            <button
              type="button"
              className={`settings-theme-option${themePref === "dark" ? " active" : ""}`}
              onClick={() => selectTheme("dark")}
            >
              <IconMoon size={16} />
              {t("settings.theme_dark")}
            </button>
            <button
              type="button"
              className={`settings-theme-option${themePref === "system" ? " active" : ""}`}
              onClick={() => selectTheme("system")}
            >
              <IconMonitor size={16} />
              {t("settings.theme_system")}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <LanguageSwitcher />
      </div>

      {onOpenHelp && (
        <div className="settings-section">
          <h3 className="settings-section-title">
            <IconHelp size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {t("settings.help_title")}
          </h3>
          <p className="settings-desc" style={{ marginBottom: 10 }}>
            {t("settings.help_desc")}
          </p>
          <div className="settings-help-links">
            <button type="button" className="settings-help-link" onClick={() => onOpenHelp("user-guide")}>
              <IconBookOpen size={16} />
              {t("settings.help_user_guide")}
            </button>
            <button type="button" className="settings-help-link" onClick={() => onOpenHelp("faq")}>
              <IconHelp size={16} />
              {t("settings.help_faq")}
            </button>
            <button type="button" className="settings-help-link" onClick={() => onOpenHelp("release-notes")}>
              <IconSparkle size={16} />
              {t("settings.help_whats_new")}
            </button>
            <button type="button" className="settings-help-link" onClick={() => onOpenHelp("about")}>
              <IconInfo size={16} />
              {t("settings.help_about")}
            </button>
          </div>
        </div>
      )}

      <div className="settings-section">
        <h3 className="settings-section-title" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <IconMonitor size={18} /> {t("settings.specs_title")}
        </h3>
        {specsLoading ? (
          <div className="aiwizard-loading">
            <IconSpinner size={16} /> {t("settings.specs_loading")}
          </div>
        ) : specs ? (
          <div className="settings-specs">
            <div className="settings-spec-row">
              <span className="settings-spec-label">{t("settings.specs_ram")}</span>
              <span className="settings-spec-value">{specs.total_ram_gb} GB</span>
            </div>
            <div className="settings-spec-row">
              <span className="settings-spec-label">{t("settings.specs_cpu")}</span>
              <span className="settings-spec-value">{specs.cpu_cores} cores</span>
            </div>
            <div className="settings-spec-row">
              <span className="settings-spec-label">{t("settings.specs_local_model")}</span>
              <span className="settings-spec-value">{localModel}</span>
            </div>
          </div>
        ) : (
          <p className="settings-desc">{t("settings.specs_error")}</p>
        )}
      </div>
              </div>
            )}

            {activeSection === "diagnostics" && (
              <div className="settings-diagnostics">
                <div className="settings-section settings-section--flat settings-diag-surface">
                  <div className="settings-diag-toolbar">
                    <div className="settings-diag-toolbar-head">
                      <h3 className="settings-section-title settings-diag-title" style={{ margin: 0 }}>
                        <IconActivity size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
                        {t("settings.diag_title")}
                      </h3>
                      <p className="settings-diag-intro">{t("settings.diag_desc")}</p>
                    </div>
                    <div className="settings-diag-toolbar-actions">
                      <button
                        type="button"
                        className="settings-btn-secondary"
                        onClick={loadDiagnostics}
                        disabled={diagLoading}
                      >
                        {diagLoading ? <IconSpinner size={14} /> : <IconRefresh size={14} />}
                        {t("settings.diag_refresh")}
                      </button>
                      <button
                        type="button"
                        className="settings-btn-secondary"
                        onClick={handleCopyDiagnostics}
                        disabled={!diagnostics}
                      >
                        <IconCopy size={14} />
                        {t("settings.diag_copy_report")}
                      </button>
                    </div>
                  </div>

                  {diagLoading && !diagnostics ? (
                    <div className="aiwizard-loading" style={{ padding: "24px 0" }}>
                      <IconSpinner size={18} /> {t("settings.diag_scanning")}
                    </div>
                  ) : diagnostics ? (
                    <>
                      <div className="settings-diag-grid">
                        <div className={`settings-diag-card settings-diag-card--${diagStatus(diagnostics.backend_ready)}`}>
                          <span className="settings-diag-label">{t("settings.diag_backend")}</span>
                          <strong>{diagnostics.backend_ready ? t("settings.diag_ready") : t("settings.diag_starting")}</strong>
                          <span className="settings-diag-hint">{diagnostics.init_message || BASE_URL}</span>
                        </div>
                        <div className={`settings-diag-card settings-diag-card--${diagStatus(diagnostics.embedder_ready)}`}>
                          <span className="settings-diag-label">{t("settings.diag_embedder")}</span>
                          <strong>{diagnostics.embedder_ready ? t("settings.diag_ready") : t("settings.diag_loading_model")}</strong>
                          <span className="settings-diag-hint">{diagnostics.embedding_model}</span>
                        </div>
                        <div className={`settings-diag-card settings-diag-card--${diagStatus(diagnostics.bm25_ready)}`}>
                          <span className="settings-diag-label">{t("settings.diag_fts")}</span>
                          <strong>{diagnostics.bm25_ready ? t("settings.diag_active") : t("settings.diag_not_ready")}</strong>
                          <span className="settings-diag-hint">{t("settings.diag_fts_hint")}</span>
                        </div>
                        <div className={`settings-diag-card settings-diag-card--${diagStatus(diagnostics.vector_ready)}`}>
                          <span className="settings-diag-label">{t("settings.diag_vector_store")}</span>
                          <strong>{diagnostics.vector_ready ? t("settings.diag_connected") : t("settings.diag_not_ready")}</strong>
                          <span className="settings-diag-hint">{t("settings.diag_vectors", { count: diagnostics.chroma_chunks })}</span>
                        </div>
                        <div className={`settings-diag-card settings-diag-card--${diagStatus(diagnostics.chunk_sync_ok)}`}>
                          <span className="settings-diag-label">{t("settings.diag_chunk_sync")}</span>
                          <strong>{diagnostics.chunk_sync_ok ? t("settings.diag_matched") : t("settings.diag_mismatched")}</strong>
                          <span className="settings-diag-hint">
                            {diagnostics.total_chunks} SQLite / {diagnostics.chroma_chunks} Chroma
                          </span>
                        </div>
                        <div className={`settings-diag-card settings-diag-card--${diagStatus(!diagnostics.disk.warning)}`}>
                          <span className="settings-diag-label">{t("settings.diag_disk")}</span>
                          <strong>
                            {diagnostics.disk.free_gb != null ? t("settings.diag_disk_free", { gb: diagnostics.disk.free_gb }) : t("settings.diag_disk_unknown")}
                          </strong>
                          <span className="settings-diag-hint">
                            {diagnostics.disk.warning ? t("settings.diag_disk_warning") : diagnostics.data_dir}
                          </span>
                        </div>
                      </div>

                      <div className="settings-diag-stats">
                        <span className="settings-diag-stat-chip">{diagnostics.total_papers} papers</span>
                        <span className="settings-diag-stat-chip">{t("settings.diag_indexed", { count: diagnostics.indexed_papers })}</span>
                        <span className="settings-diag-stat-chip">{t("settings.diag_data_size", { mb: diagnostics.total_size_mb })}</span>
                        <span className="settings-diag-stat-chip">LLM: {diagnostics.llm_mode}</span>
                        <span className="settings-diag-stat-chip">{t("settings.diag_setup_complete")}: {diagnostics.setup_completed ? t("settings.diag_setup_complete") : t("settings.diag_setup_incomplete")}</span>
                      </div>
                    </>
                  ) : (
                    <p className="settings-desc">{t("settings.diag_load_error")}</p>
                  )}

                  {diagMsg && (
                    <div
                      className={`settings-storage-msg ${diagMsg.type}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 12,
                        color: diagMsg.type === "success" ? "var(--color-success)" : "var(--color-error)",
                      }}
                    >
                      {diagMsg.type === "success" ? <IconCheck size={14} /> : <IconError size={14} />}
                      <span>{diagMsg.text}</span>
                    </div>
                  )}
                </div>

                <div className="settings-section">
                  <h3 className="settings-section-title">
                    <IconRefresh size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
                    {t("settings.maintenance_title")}
                  </h3>
                  <p className="settings-desc" style={{ marginBottom: 12 }}>
                    {t("settings.maintenance_desc")}
                  </p>
                  <div className="settings-diag-actions">
                    <button
                      type="button"
                      className="settings-btn-secondary"
                      onClick={handleRebuildFts}
                      disabled={rebuildingFts || diagLoading}
                    >
                      {rebuildingFts ? <IconSpinner size={14} /> : <IconSearch size={14} />}
                      {t("settings.maintenance_rebuild_fts")}
                    </button>
                    <button
                      type="button"
                      className="settings-btn-secondary"
                      onClick={handleClearCache}
                      disabled={clearingCache || actionLoading}
                    >
                      {clearingCache ? <IconSpinner size={14} /> : <IconTrash size={14} />}
                      {t("settings.maintenance_clear_cache")}
                    </button>
                    <button type="button" className="settings-btn-secondary" onClick={handleOpenFolder} disabled={actionLoading}>
                      <IconFolderOpen size={14} />
                      {t("settings.maintenance_open_folder")}
                    </button>
                  </div>
                  {cacheMsg && (
                    <p className="settings-desc" style={{ marginTop: 8, color: "var(--color-success)" }}>{cacheMsg}</p>
                  )}
                </div>

                <div className="settings-section">
                  <h3 className="settings-section-title">
                    <IconRocket size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
                    {t("settings.onboarding_title")}
                  </h3>
                  <p className="settings-desc" style={{ marginBottom: 12 }}>
                    {t("settings.onboarding_desc")}
                  </p>
                  <div className="settings-diag-actions">
                    <button type="button" className="settings-btn-secondary" onClick={handleReplayWelcomeTour}>
                      <IconRocket size={14} />
                      {t("settings.onboarding_tour")}
                    </button>
                    <button type="button" className="settings-btn-secondary" onClick={handleReplaySetupWizard}>
                      <IconSparkle size={14} />
                      {t("settings.onboarding_setup_wizard")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "ai" && (
              <>
      <div className="settings-section settings-section--flat">
        <h3 className="settings-section-title">
          <IconSparkle size={18} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
          {t("settings.ai_title")}
        </h3>
        <p className="settings-desc">
          {t("settings.ai_desc")}
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
                <span className="settings-mode-badge">{t("settings.ai_recommended")}</span>
              )}
            </button>
          ))}
        </div>

        {/* Cloud Free stats */}
        {llmMode === "cloud_free" && (
          <div className="settings-mode-detail settings-usage-banner">
            <div className="settings-usage-banner-inner">
              <div>
                <span className="settings-usage-title">
                  <IconZap size={16} /> {t("settings.ai_usage_title")}
                </span>
              </div>
              <div className="settings-usage-count">
                {usage ? (
                  <>
                    <strong>{usage.used} / {usage.limit}</strong>
                    <span>{t("settings.ai_usage_questions")}</span>
                  </>
                ) : (
                  <span>{t("settings.ai_usage_loading")}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Custom Cloud settings */}
        {llmMode === "cloud_custom" && (
          <div className="settings-mode-detail" style={{ marginTop: 16 }}>
            <div className="settings-provider-tabs">
              {(["deepseek", "gemini", "claude", "groq", "nvidia", "github", "freemodel"] as const).map((provider) => {
                const labels: Record<string, string> = {
                  deepseek: "DeepSeek",
                  gemini: "Gemini",
                  claude: "Claude",
                  groq: "Groq",
                  nvidia: "Nvidia NIM",
                  github: "GitHub Models",
                  freemodel: "FreeModel",
                };
                return (
                  <button
                    key={provider}
                    type="button"
                    className={`settings-provider-tab${customCloudProvider === provider ? " active" : ""}`}
                    onClick={() => setCustomCloudProvider(provider)}
                  >
                    {labels[provider]}
                  </button>
                );
              })}
            </div>

            {customCloudProvider === "deepseek" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_api_key", { provider: "DeepSeek" })}</label>
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
                      title={showApiKey ? t("settings.toggle_hide_key") : t("settings.toggle_show_key")}
                    >
                      {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>                    <p className="settings-field-hint">
                    <IconWithText icon={IconLock} size={12}>{t("settings.api_key_saved_locally")}</IconWithText>
                    <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}{t("settings.get_key_here")}
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_model", { provider: "DeepSeek" })}</label>
                  <select className="settings-select" value={deepseekModel} onChange={(e) => setDeepseekModel(e.target.value)}>
                    <option value="deepseek-chat">deepseek-chat ({t("settings.model_desc.deepseek_chat")})</option>
                    <option value="deepseek-reasoner">deepseek-reasoner ({t("settings.model_desc.deepseek_reasoner")})</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "gemini" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_api_key", { provider: "Gemini" })}</label>
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
                      title={showApiKey ? t("settings.toggle_hide_key") : t("settings.toggle_show_key")}
                    >
                      {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    <IconWithText icon={IconLock} size={12}>{t("settings.api_key_saved_locally")}</IconWithText>
                    <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}{t("settings.get_key_here")}
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_model", { provider: "Gemini" })}</label>
                  <select className="settings-select" value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}>
                    <option value="gemini-2.5-flash">gemini-2.5-flash ({t("settings.model_desc.gemini_25_flash")})</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash ({t("settings.model_desc.gemini_20_flash")})</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro ({t("settings.model_desc.gemini_15_pro")})</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "claude" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_api_key", { provider: "Claude" })}</label>
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
                      title={showApiKey ? t("settings.toggle_hide_key") : t("settings.toggle_show_key")}
                    >
                      {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    <IconWithText icon={IconLock} size={12}>{t("settings.api_key_saved_locally")}</IconWithText>
                    <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}{t("settings.get_key_here")}
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_model", { provider: "Claude" })}</label>
                  <select className="settings-select" value={claudeModel} onChange={(e) => setClaudeModel(e.target.value)}>
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4 ({t("settings.model_desc.claude_sonnet_4")})</option>
                    <option value="claude-haiku-3-5-20241022">Claude Haiku 3.5 ({t("settings.model_desc.claude_haiku_35")})</option>
                    <option value="claude-opus-4-20250514">Claude Opus 4 ({t("settings.model_desc.claude_opus_4")})</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "groq" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_api_key", { provider: "Groq" })}</label>
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
                      title={showApiKey ? t("settings.toggle_hide_key") : t("settings.toggle_show_key")}
                    >
                      {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    <IconWithText icon={IconLock} size={12}>{t("settings.api_key_saved_locally")}</IconWithText>
                    <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}{t("settings.get_key_here")}
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_model", { provider: "Groq" })}</label>
                  <select className="settings-select" value={groqModel} onChange={(e) => setGroqModel(e.target.value)}>
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile ({t("settings.model_desc.llama_33_70b_versatile")})</option>
                    <option value="llama-3.3-70b-specdec">llama-3.3-70b-specdec ({t("settings.model_desc.llama_33_70b_specdec")})</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768 ({t("settings.model_desc.mixtral_8x7b")})</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "nvidia" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_api_key", { provider: "Nvidia NIM" })}</label>
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
                      title={showApiKey ? t("settings.toggle_hide_key") : t("settings.toggle_show_key")}
                    >
                      {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    <IconWithText icon={IconLock} size={12}>{t("settings.api_key_saved_locally")}</IconWithText>
                    <a href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}{t("settings.get_key_here")}
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_model", { provider: "Nvidia NIM" })}</label>
                  <select className="settings-select" value={nvidiaModel} onChange={(e) => setNvidiaModel(e.target.value)}>
                    <option value="moonshotai/kimi-k2.6">moonshotai/kimi-k2.6 ({t("settings.model_desc.kimi_k26")})</option>
                    <option value="deepseek-ai/deepseek-v3">deepseek-ai/deepseek-v3 ({t("settings.model_desc.deepseek_v3")})</option>
                    <option value="meta/llama-3.3-70b-instruct">meta/llama-3.3-70b-instruct ({t("settings.model_desc.llama_33_70b_instruct")})</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "freemodel" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_api_key", { provider: "FreeModel" })}</label>
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
                      title={showApiKey ? t("settings.toggle_hide_key") : t("settings.toggle_show_key")}
                    >
                      {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    <IconWithText icon={IconLock} size={12}>{t("settings.api_key_saved_locally")}</IconWithText>
                    <a href="https://freemodel.dev/" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}{t("settings.get_key_here")}
                    </a>
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_model", { provider: "FreeModel" })}</label>
                  <select className="settings-select" value={freemodelModel} onChange={(e) => setFreemodelModel(e.target.value)}>
                    <option value="gpt-4o-mini">gpt-4o-mini ({t("settings.model_desc.gpt_4o_mini_standard")})</option>
                    <option value="claude-3-5-haiku">claude-3-5-haiku ({t("settings.model_desc.claude_35_haiku")})</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash ({t("settings.model_desc.gemini_25_flash_freemodel")})</option>
                  </select>
                </div>
              </>
            )}

            {customCloudProvider === "github" && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.github_access_token")}</label>
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
                      title={showApiKey ? t("settings.toggle_hide_key") : t("settings.toggle_show_key")}
                    >
                      {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  <p className="settings-field-hint">
                    <IconWithText icon={IconLock} size={12}>{t("settings.token_saved_locally")}</IconWithText>
                    <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="settings-link">
                      {" "}{t("settings.get_token_here")}
                    </a>
                    <br />
                    {t("settings.github_permissions_hint")}
                  </p>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t("settings.provider_model", { provider: "GitHub" })}</label>
                  <select className="settings-select" value={githubModel} onChange={(e) => setGithubModel(e.target.value)}>
                    <option value="gpt-4o-mini">gpt-4o-mini ({t("settings.model_desc.gpt_4o_mini_github")})</option>
                    <option value="microsoft/gpt-4o-mini">microsoft/gpt-4o-mini ({t("settings.model_desc.gpt_4o_mini_full")})</option>
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
              <label className="settings-label">{t("settings.llama_server_url")}</label>
              <input
                type="text"
                className="settings-input"
                value={llamaServerUrl}
                onChange={(e) => setLlamaServerUrl(e.target.value)}
                placeholder="http://127.0.0.1:8080"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">{t("settings.label_gguf_model")}</label>
              <input
                type="text"
                className="settings-input"
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
                placeholder="Qwen3-4B-Q4_K_M.gguf"
              />
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", marginTop: 8 }}>
              {t("settings.local_cpu_startup")} <code>llama-server.exe -m path/to/{localModel} --port 8080 -c 4096 -np 1 -t 6 --cache-ram 1024</code>
            </p>
            <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", marginTop: 8 }}>
              {t("settings.download_at")} 
              <a href="#" onClick={(e) => { e.preventDefault(); open("https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/tree/main"); }} style={{ marginLeft: 4 }}>
                https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/tree/main
              </a>
            </p>
          </div>
        )}

        <div className="settings-actions settings-actions--sticky">
          <button type="button" className="settings-save-btn" onClick={saveSettings} disabled={saving}>
              {saving ? <IconSpinner size={16} /> : <IconCheck size={16} />}
            <span>{saving ? t("settings.ai_saving") : t("settings.ai_save_config")}</span>
          </button>
          {saveMsg && (
            <span className={`settings-save-msg settings-save-msg--${saveMsg.type}`}>
              {saveMsg.type === "success" ? (
                saveMsg.type === "success" && saveMsg.text === t("settings.validate_connecting") ? <IconSpinner size={14} /> : <IconCheck size={14} />
              ) : (
                <IconError size={14} />
              )}
              {saveMsg.text}
            </span>
          )}
        </div>
      </div>
              </>
            )}

            {activeSection === "data" && (
              <>
      {/* ── Data Management ────────────────────────────────── */}
      <div className="settings-section settings-section--flat">
        <div className="settings-storage-box">
          <div className="settings-storage-info">
            <span className="settings-storage-label">{t("settings.data_storage_dir")}</span>
            <code className="settings-storage-path">
              {stats?.data_dir || t("common.loading")}
            </code>
            <p className="settings-storage-hint">
              {t("settings.data_storage_desc")}
            </p>
          </div>
          
          <div className="settings-storage-actions">
            <button className="settings-btn-secondary" onClick={handleOpenFolder} disabled={actionLoading}>
              <IconFolderOpen size={16} /> {t("settings.data_open_folder")}
            </button>
            <button className="settings-btn-secondary" onClick={handleChangeStoragePath} disabled={actionLoading}>
              <IconFolder size={16} /> {t("settings.data_move_folder")}
            </button>
            <button className="settings-btn-danger-outline" onClick={handleClearData} disabled={actionLoading}>
              <IconTrash size={16} /> {t("settings.data_clear_documents")}
            </button>
            <button className="settings-btn-danger" onClick={handleResetApp} disabled={actionLoading}>
              <IconRefresh size={16} /> {t("settings.data_reset_app")}
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
            <span className="settings-storage-label" style={{ fontWeight: 600 }}>{t("settings.data_zotero_title")}</span>
            <p className="settings-storage-hint" style={{ marginBottom: 12 }}>
              {t("settings.data_zotero_desc")}
            </p>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", marginBottom: "8px" }}>
              <input
                type="text"
                className="settings-input"
                value={zoteroDataDir}
                onChange={(e) => setZoteroDataDir(e.target.value)}
                placeholder={t("settings.zotero_data_dir_placeholder")}
                style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
              />
              <button 
                className="settings-btn-secondary" 
                onClick={handleSelectZoteroPath}
                style={{ padding: "6px 12px", fontSize: "0.85rem", whiteSpace: "nowrap" }}
              >
                <IconWithText icon={IconFolder} size={14}>{t("settings.data_zotero_select")}</IconWithText>
              </button>
              <button 
                className="settings-btn-secondary" 
                onClick={handleDetectZotero}
                style={{ padding: "6px 12px", fontSize: "0.85rem", whiteSpace: "nowrap" }}
              >
                <IconWithText icon={IconZap} size={14}>{t("settings.data_zotero_detect")}</IconWithText>
              </button>
            </div>
          </div>

          <div className="settings-storage-info" style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
            <span className="settings-storage-label" style={{ fontWeight: 600 }}>{t("settings.data_cache_title")}</span>
            <p className="settings-storage-hint" style={{ marginBottom: 8 }}>
              {t("settings.data_cache_desc")}
            </p>
            <div style={{ display: "flex", gap: "16px", marginTop: "8px", marginBottom: "8px" }}>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", padding: "8px 12px", borderRadius: "var(--radius-md)" }}>
                <span style={{ display: "block", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{t("settings.data_ai_responses")}</span>
                <strong>{t("settings.data_records", { count: cacheStats?.llm_cache_count ?? 0 })}</strong>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", padding: "8px 12px", borderRadius: "var(--radius-md)" }}>
                <span style={{ display: "block", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{t("settings.data_vector_embeddings")}</span>
                <strong>{t("settings.data_records", { count: cacheStats?.embedding_cache_count ?? 0 })}</strong>
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
                <span>{clearingCache ? t("settings.data_cache_clearing") : t("settings.data_cache_clear")}</span>
              </button>
              {cacheMsg && (
                <span style={{ fontSize: "0.85rem", color: "var(--color-success)" }}>
                  {cacheMsg}
                </span>
              )}
            </div>
          </div>

          <div className="settings-storage-info" style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
            <span className="settings-storage-label" style={{ fontWeight: 600 }}>{t("settings.data_resource_title")}:</span>
            <p className="settings-storage-hint" style={{ marginBottom: 12 }}>
              {t("settings.data_resource_desc")}
            </p>
            
            {modelStatus && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--color-bg-hover, #f8fafc)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("settings.data_embedding_model")}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{modelStatus.embedder.model_name || "bge-m3"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {modelStatus.embedder.loaded ? (
                      <>
                        <span style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e", padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600 }}><IconWithText icon={IconCircle} size={12}>{t("settings.data_model_active")}</IconWithText></span>
                        <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>{t("settings.data_model_idle", { seconds: modelStatus.embedder.idle_seconds })}</span>
                      </>
                    ) : (
                      <span style={{ background: "rgba(148, 163, 184, 0.1)", color: "#94a3b8", padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600 }}><IconWithText icon={IconPauseCircle} size={12}>{t("settings.data_model_paused")}</IconWithText></span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--color-bg-hover, #f8fafc)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("settings.data_reranker_model")}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{modelStatus.reranker.model_name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {modelStatus.reranker.loaded ? (
                      <>                        <span style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e", padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600 }}><IconWithText icon={IconCircle} size={12}>{t("settings.data_model_active")}</IconWithText></span>
                        <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>{t("settings.data_model_idle", { seconds: modelStatus.reranker.idle_seconds })}</span>
                      </>
                    ) : (
                      <span style={{ background: "rgba(148, 163, 184, 0.1)", color: "#94a3b8", padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600 }}><IconWithText icon={IconPauseCircle} size={12}>{t("settings.data_model_paused")}</IconWithText></span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
              </>
            )}

            {activeSection === "advanced" && (
              <>
      {/* ── Provider Routing ────────────────────────────────── */}
      <div className="settings-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 className="settings-section-title" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <IconZap size={18} /> {t("settings.advanced_provider_routing")}
            </h3>
            <p className="settings-desc">
              {t("settings.advanced_provider_desc")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTaskProviderMapStr(JSON.stringify({
                summary: "groq", daily_reader: "github", chat: "github",
                quality_check: "github", insight: "github", rag: "gemini",
                gap: "nvidia_deepseek", critique: "gemini", debate: "nvidia_deepseek",
                verify: "gemini", review: "nvidia_deepseek", graph: "cerebras",
                research: "groq", synthesis: "groq", entity: "cerebras",
              }, null, 2));
              setTaskFallbackMapStr(JSON.stringify({
                summary: "cloudflare", daily_reader: "cohere", chat: "openrouter",
                quality_check: "cohere", insight: "openrouter", rag: "cerebras",
                gap: "gemini", critique: "nvidia_deepseek", debate: "gemini",
                verify: "nvidia_deepseek", review: "gemini", graph: "gemini",
                research: "openrouter", synthesis: "openrouter", entity: "cohere",
              }, null, 2));
            }}
            style={{
              padding: "6px 12px", fontSize: "0.78rem", whiteSpace: "nowrap",
              background: "transparent", border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)", color: "var(--color-text-muted)",
              cursor: "pointer",
            }}
            title={t("settings.reset_provider_mapping_title")}
          >
            {t("settings.advanced_reset_defaults")}
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>{t("settings.advanced_task")}</th>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>{t("settings.advanced_primary_provider")}</th>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>{t("settings.advanced_fallback")}</th>
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
                        <option value="">{t("settings.advanced_default")}</option>
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
                        <option value="">{t("settings.advanced_none")}</option>
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

        <details className="settings-advanced-details">
          <summary>{t("settings.advanced_json_view")}</summary>
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
          {t("settings.advanced_system_title")}
        </h3>
        <div className="settings-about">
          <p>{t("settings.advanced_version")}: <strong>0.6.0</strong></p>
          <p>{t("settings.advanced_built_by")}: <strong>Viu Gia Lai</strong></p>
          <p>
            {t("settings.system_info_ai_mode")}{" "}
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
            {t("settings.system_info_embedding")}{" "}                <strong>
                  {embeddingMode === "cloud"
                    ? <IconWithText icon={IconCloud} size={12}>Gemini</IconWithText>
                    : <IconWithText icon={IconLaptop} size={12}>{`${embeddingModel || "bge-m3"} (${t("settings.embedding_local_option")})`}</IconWithText>}
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
                <option value="local">{t("settings.embedding_local_option")}</option>
                <option value="cloud">{t("settings.embedding_cloud_option")}</option>
              </select>
              {embeddingMode === "cloud" && (
                <button
                  onClick={testEmbedding}
                  disabled={testingEmbedding}
                  title={t("settings.test_gemini_embedding_title")}
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
                  {testingEmbedding ? (
                    <IconSpinner size={14} />
                  ) : embeddingTestResult === "success" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <IconCheck size={14} /> OK
                    </span>
                  ) : embeddingTestResult === "error" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <IconError size={14} /> {t("common.error")}
                    </span>                    ) : (
                    t("settings.embedding_test_connection")
                  )}
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
            {t("settings.system_info_mmr")}{" "}
            <strong>
              {mmrLambda !== "" ? (
                <IconWithText icon={IconRotateCcw} size={12}>{`λ=${mmrLambda}`}</IconWithText>
              ) : (
                <IconWithText icon={IconSkipForward} size={12}>{t("settings.mmr_off")}</IconWithText>
              )}
            </strong>
          </p>
          <p style={{ marginTop: 4 }}>
            {t("settings.system_info_reranker")}{" "}
            <strong>
              {enableReranker ? (
                <IconWithText icon={IconPlug} size={12}>{t("settings.reranker_on")}</IconWithText>
              ) : (
                <IconWithText icon={IconZap} size={12}>{t("settings.reranker_off")}</IconWithText>
              )}
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
                <option value="false">{t("settings.reranker_speed")}</option>
                <option value="true">{t("settings.reranker_accuracy")}</option>
              </select>
            </span>
          </p>
          {embeddingMode === "local" && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                {t("settings.advanced_embedding_query")}
              </label>
              <input
                type="text"
                value={embeddingQueryInstruction}
                onChange={e => setEmbeddingQueryInstruction(e.target.value)}
                placeholder={t("settings.query_instruction_placeholder")}
                style={{
                  fontSize: "0.75rem", padding: "4px 8px",
                  background: "var(--color-surface)", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)", color: "var(--color-text)",
                  width: "100%", maxWidth: 500,
                }}
              />
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 4 }}>
                {t("settings.advanced_embedding_passage")}
              </label>
              <input
                type="text"
                value={embeddingPassageInstruction}
                onChange={e => setEmbeddingPassageInstruction(e.target.value)}
                placeholder={t("settings.passage_instruction_placeholder")}
                style={{
                  fontSize: "0.75rem", padding: "4px 8px",
                  background: "var(--color-surface)", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)", color: "var(--color-text)",
                  width: "100%", maxWidth: 500,
                }}
              />
              <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
                {embeddingQueryInstruction || embeddingPassageInstruction
                  ? t("settings.embedding_instruction_used", { query: embeddingQueryInstruction ? "query + " : "", passage: embeddingPassageInstruction ? "passage" : "" })
                  : t("settings.embedding_instruction_empty_hint")}
              </span>
              <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  {t("settings.advanced_embedding_pooling")}
                  <select
                    value={embeddingPooling}
                    onChange={e => setEmbeddingPooling(e.target.value)}
                    style={{ fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)", cursor: "pointer" }}
                  >
                    <option value="cls">CLS</option>
                    <option value="mean">Mean</option>
                    <option value="last_token">{t("settings.pooling_last_token")}</option>
                  </select>
                </label>
                <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={normalizeEmbeddings}
                    onChange={e => setNormalizeEmbeddings(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  {t("settings.advanced_embedding_normalize")}
                </label>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  {t("settings.advanced_embedding_mmr")}
                  <input
                    type="number"
                    value={mmrLambda}
                    onChange={e => setMmrLambda(e.target.value)}
                    placeholder={t("settings.off_placeholder")}
                    min={0} max={1} step={0.05}
                    style={{ width: 70, fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)" }}
                  />
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>
                    {t("settings.advanced_embedding_mmr_hint")}
                  </span>
                </label>
              </div>
            </div>
          )}
          <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
              {t("settings.advanced_model_router")}
            </span>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 8 }}>
              {t("settings.advanced_model_router_desc")}
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                {t("settings.advanced_context_threshold")}
                <input
                  type="number"
                  value={largeContextThreshold}
                  onChange={e => setLargeContextThreshold(Number(e.target.value))}
                  style={{ width: 80, fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)" }}
                  min={1000} max={500000} step={1000}
                />
                {t("settings.system_info_tokens_unit")}
              </label>
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                {t("settings.advanced_fallback_model_label")}
                <input
                  type="text"
                  value={largeContextModel}
                  onChange={e => setLargeContextModel(e.target.value)}
                  placeholder="claude-sonnet-4-20250514"
                  style={{ width: 160, fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)" }}
                />
              </label>
              <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                {t("settings.advanced_provider_label")}
                <select
                  value={largeContextProvider}
                  onChange={e => setLargeContextProvider(e.target.value)}
                  style={{ fontSize: "0.75rem", padding: "2px 4px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text)", cursor: "pointer" }}
                >
                  <option value="">{t("settings.advanced_default")}</option>
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
              <p>{t("settings.system_info_papers")} <strong>{stats.total_papers}</strong></p>
              <p>{t("settings.system_info_chunks_sqlite")} <strong>{stats.total_chunks}</strong></p>
              <p>{t("settings.system_info_chunks_chromadb")} <strong>{stats.chroma_chunks}</strong></p>
            </>
          )}
          <p style={{ marginTop: 16, color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            <IconLock size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            {t("settings.advanced_data_local")}
          </p>
          <div className="settings-actions settings-actions--footer">
            <button type="button" className="settings-save-btn" onClick={saveSettings} disabled={saving}>
              {saving ? <IconSpinner size={16} /> : <IconCheck size={16} />}
              <span>{saving ? t("settings.ai_saving") : t("settings.ai_save_advanced")}</span>
            </button>
          </div>
        </div>
      </div>
              </>
            )}
          </div>
        </div>
    </div>
  );
};
