import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  IconBrain,
  IconSettings,
  IconCheck,
  IconSearch,
  IconSpinner,
  IconSparkle,
  IconLock,
  IconClose,
} from "../Icons";

type LlmMode = "cloud" | "local";

interface SpecsResult {
  total_ram_gb: number;
  cpu_cores: number;
  suggested_tier: string;
  suggested_model: string;
}

export const SettingsView: React.FC = () => {
  // ── LLM Mode ────────────────────────────────────────────────
  const [llmMode, setLlmMode] = useState<LlmMode>("cloud");

  // ── Cloud (Claude) ──────────────────────────────────────────
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [claudeModel, setClaudeModel] = useState("claude-sonnet-4-20250514");

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

  // ── UI State ────────────────────────────────────────────────
  const [healthStatus, setHealthStatus] = useState<string>("Chưa kiểm tra");
  const [healthColor, setHealthColor] = useState("var(--color-text-muted)");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [stats, setStats] = useState<{ total_papers: number; total_chunks: number; chroma_chunks: number } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadSettings();
    loadStats();
    loadSpecs();
  }, []);

  const loadSettings = async () => {
    try {
      const s = await api.getSettings();
      setLlmMode(s.llm_mode as LlmMode);
      setClaudeApiKey(s.claude_api_key === "***" ? "" : s.claude_api_key);
      setClaudeModel(s.claude_model);
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
      setStats({ total_papers: s.total_papers, total_chunks: s.total_chunks, chroma_chunks: s.chroma_chunks });
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
      setOllamaModel(s.suggested_model);
    } catch (e) {
      console.error("Failed to detect specs:", e);
    } finally {
      setSpecsLoading(false);
    }
  };

  const checkHealth = async () => {
    setChecking(true);
    setHealthStatus("Đang kiểm tra...");
    setHealthColor("var(--color-text-muted)");
    try {
      const h = await api.health();
      if (h.status === "ok") {
        setHealthStatus("✅ Kết nối thành công");
        setHealthColor("var(--color-success, #22c55e)");
      } else {
        setHealthStatus("❌ Backend không phản hồi");
        setHealthColor("var(--color-error, #ef4444)");
      }
    } catch {
      setHealthStatus("❌ Không kết nối được backend");
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
      await api.updateSettings({
        llm_mode: llmMode,
        claude_api_key: claudeApiKey,
        claude_model: claudeModel,
        ollama_url: ollamaUrl,
        ollama_model: ollamaModel,
      });
      setSaveMsg({ type: "success", text: "✅ Đã lưu cấu hình!" });
    } catch (e) {
      setSaveMsg({ type: "error", text: `❌ Lỗi: ${e instanceof Error ? e.message : "Không thể lưu"}` });
    } finally {
      setSaving(false);
    }
  };

  const modeSuggestions = specs
    ? [
        { mode: "cloud" as LlmMode, label: "☁️ Dễ dùng (Khuyên dùng)", desc: "Không cần cài gì, chạy ngay", highlight: true },
        { mode: "local" as LlmMode, label: "🔒 Riêng tư tuyệt đối", desc: `Tải ~${specs.suggested_tier === "weak" ? "2" : specs.suggested_tier === "medium" ? "4.5" : "8"}GB, chạy offline`, highlight: false },
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

      {/* ── Backend Health ────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <IconBrain size={18} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
          Backend
        </h3>
        <div className="settings-health" style={{ borderColor: healthColor }}>
          <div className="settings-health-indicator" style={{ background: healthColor }} />
          <div className="settings-health-info">
            <span className="settings-health-label">{healthStatus}</span>
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

      {/* ── Thông số máy ──────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          🖥️ Thông số máy
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
              <span className="settings-spec-label">Gợi ý model</span>
              <span className="settings-spec-value settings-spec-recommended">
                {specs.suggested_tier === "weak" ? "🔹" : specs.suggested_tier === "medium" ? "🔸" : "🔶"} {specs.suggested_model}
              </span>
            </div>
            <div className="settings-spec-tiers">
              {["weak", "medium", "strong"].map((tier) => {
                const tierModel =
                  tier === "weak" ? modelTierWeak : tier === "medium" ? modelTierMedium : modelTierStrong;
                const tierLabel =
                  tier === "weak" ? "🔹 Yếu (4-8GB)" : tier === "medium" ? "🔸 Trung bình" : "🔶 Mạnh (16GB+)";
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

      {/* ── Chế độ AI (Hybrid Model) ──────────────────────── */}
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
              <div className="settings-mode-card-content">
                <span className="settings-mode-card-label">{m.label}</span>
                <span className="settings-mode-card-desc">{m.desc}</span>
              </div>
              {m.highlight && llmMode === m.mode && (
                <span className="settings-mode-badge">Khuyên dùng</span>
              )}
            </button>
          ))}
        </div>

        {/* Cloud settings */}
        {llmMode === "cloud" && (
          <div className="settings-mode-detail">
            <div className="settings-field" style={{ marginTop: 16 }}>
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
            <span className="settings-save-msg" style={{ color: saveMsg.type === "success" ? "var(--color-success)" : "var(--color-error)" }}>
              {saveMsg.text}
            </span>
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
          <p>Chế độ AI: <strong>{llmMode === "cloud" ? "☁️ Cloud (Claude)" : "🔒 Local (Ollama)"}</strong></p>
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
            <span>🔒 Local First</span>
            <span>🎓 Cho nghiên cứu sinh</span>
            <span>🇻🇳 Tiếng Việt</span>
            <span>📄 PDF</span>
          </div>
        </div>
      </div>
    </div>
  );
};
