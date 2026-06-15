import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
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
  const [customCloudProvider, setCustomCloudProvider] = useState<"deepseek" | "gemini" | "claude">("deepseek");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [claudeModel, setClaudeModel] = useState("claude-sonnet-4-20250514");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-1.5-flash");

  // ── Local (Ollama) ──────────────────────────────────────────
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("qwen2.5:7b");
  const [modelTierWeak, setModelTierWeak] = useState("qwen2.5:3b");
  const [modelTierMedium, setModelTierMedium] = useState("qwen2.5:7b");
  const [modelTierStrong, setModelTierStrong] = useState("qwen2.5:14b");
  const [activeTier, setActiveTier] = useState<string>("medium");

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
  const [stats, setStats] = useState<{ total_papers: number; total_chunks: number; chroma_chunks: number; data_dir?: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // ── Data Management State ─────────────────────────────────────
  const [actionLoading, setActionLoading] = useState(false);
  const [storageMsg, setStorageMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
    loadStats();
    loadSpecs();
    loadUsage();
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
      setGeminiModel(s.gemini_model || "gemini-1.5-flash");
      setCustomCloudProvider((s.custom_cloud_provider as "deepseek" | "gemini" | "claude") || "deepseek");
      setOllamaUrl(s.ollama_url);
      setOllamaModel(s.ollama_model);
      setModelTierWeak(s.model_tier_weak);
      setModelTierMedium(s.model_tier_medium);
      setModelTierStrong(s.model_tier_strong);
      setEmbeddingModel(s.embedding_model);
    } catch (e) {
      console.error("Failed to load settings:", e);
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
      setActiveTier(s.suggested_tier);
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

  const handleTierChange = (tier: string) => {
    setActiveTier(tier);
    const modelMap: Record<string, string> = {
      weak: modelTierWeak,
      medium: modelTierMedium,
      strong: modelTierStrong,
    };
    setOllamaModel(modelMap[tier] || modelTierMedium);
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
            : claudeApiKey;
        const activeModel =
          customCloudProvider === "deepseek"
            ? deepseekModel
            : customCloudProvider === "gemini"
            ? geminiModel
            : claudeModel;

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
        ollama_url: ollamaUrl,
        ollama_model: ollamaModel,
      });
      setSaveMsg({ type: "success", text: "Đã lưu cấu hình!" });
      loadUsage();
    } catch (e) {
      setSaveMsg({ type: "error", text: `Lỗi: ${e instanceof Error ? e.message : "Không thể lưu"}` });
    } finally {
      setSaving(false);
    }
  };

  const modeSuggestions = specs
    ? [
        { mode: "cloud_free" as LlmMode, label: "Cloud Free (Gemini Free)", desc: "Miễn phí 10 câu/ngày qua Gemini API, chạy ngay", highlight: true },
        { mode: "cloud_custom" as LlmMode, label: "Custom API Key", desc: "Gemini, DeepSeek hoặc Claude API của riêng bạn", highlight: false },
        { mode: "local" as LlmMode, label: "Riêng tư tuyệt đối", desc: `Tải ~${specs.suggested_tier === "weak" ? "2" : specs.suggested_tier === "medium" ? "4.5" : "8"}GB, chạy offline`, highlight: false },
      ]
    : [];

  return (
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
              FastAPI backend: http://127.0.0.1:8765
            </span>
          </div>
          <button className="settings-health-btn" onClick={checkHealth} disabled={checking}>
            {checking ? <IconSpinner size={16} /> : <IconSearch size={16} />}
            <span>Kiểm tra</span>
          </button>
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
            <div className="settings-spec-tiers">
              {["weak", "medium", "strong"].map((tier) => {
                const tierModel =
                  tier === "weak" ? modelTierWeak : tier === "medium" ? modelTierMedium : modelTierStrong;
                const tierLabel =
                  tier === "weak" ? "Nhẹ (4-8GB)" : tier === "medium" ? "Trung bình" : "Mạnh (16GB+)";
                return (
                  <button
                    key={tier}
                    className={`settings-tier-chip ${activeTier === tier ? "active" : ""} ${specs?.suggested_tier === tier ? "recommended" : ""}`}
                    onClick={() => handleTierChange(tier)}
                    title={specs?.suggested_tier === tier ? "✅ Phù hợp với máy bạn" : ""}
                  >
                    <span className="settings-tier-name">{tierLabel}</span>
                    <span className="settings-tier-model">{tierModel}</span>
                    {specs?.suggested_tier === tier && <span className="settings-tier-badge">Gợi ý</span>}
                  </button>
                );
              })}
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
              onClick={() => setLlmMode(m.mode)}
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
            <div style={{ background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.15)", borderRadius: "8px", padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <IconZap size={16} /> Lượt sử dụng miễn phí
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Hạn mức hệ thống tự động đặt lại mỗi ngày</span>
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
            <div className="provider-tabs" style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              {["deepseek", "gemini", "claude"].map((provider) => {
                const isActive = customCloudProvider === provider;
                const labels: Record<string, string> = {
                  deepseek: "DeepSeek (Rẻ)",
                  gemini: "Gemini (Nhanh)",
                  claude: "Claude (Mạnh)"
                };
                return (
                  <button
                    key={provider}
                    className="provider-tab-btn"
                    onClick={() => setCustomCloudProvider(provider as any)}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color, #e2e8f0)",
                      background: isActive ? "rgba(99, 102, 241, 0.1)" : "transparent",
                      borderColor: isActive ? "var(--color-primary, #6366f1)" : "var(--border-color)",
                      color: isActive ? "var(--color-primary, #6366f1)" : "var(--color-text)",
                      cursor: "pointer", fontWeight: "bold"
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
                    <option value="gemini-1.5-flash">gemini-1.5-flash (nhanh, nhẹ, context cực lớn)</option>
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
          </div>
        )}

        {/* Local settings */}
        {llmMode === "local" && (
          <div className="settings-mode-detail">
            <div className="settings-field" style={{ marginTop: 16 }}>
              <label className="settings-label">Ollama URL</label>
              <input
                type="text"
                className="settings-input"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Model</label>
              <input
                type="text"
                className="settings-input"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="qwen2.5:7b"
              />
            </div>
            <div className="settings-quick">
              <span className="settings-quick-label">Lệnh:</span>
              <code className="settings-quick-code">ollama pull {ollamaModel}</code>
              <code className="settings-quick-code">ollama serve</code>
            </div>
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
        </div>
      </div>

      {/* ── System Info ───────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <IconSparkle size={18} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
          Hệ thống
        </h3>
        <div className="settings-about">
          <p>Phiên bản: <strong>0.1.0</strong></p>
          <p>
            Chế độ AI:{" "}
            <strong style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              {llmMode === "cloud_free" ? (
                <>
                  <IconZap size={14} /> Cloud Free (Gemini)
                </>
              ) : llmMode === "cloud_custom" ? (
                <>
                  <IconKey size={14} /> Custom Cloud ({customCloudProvider === "deepseek" ? "DeepSeek" : customCloudProvider === "gemini" ? "Gemini" : "Claude"})
                </>
              ) : (
                <>
                  <IconLock size={14} /> Local (Ollama)
                </>
              )}
            </strong>
          </p>
          <p>Embedding model: <strong>{embeddingModel || "bge-m3"}</strong></p>
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
  );
};
