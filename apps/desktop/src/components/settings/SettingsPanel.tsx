import React, { useEffect, useState } from "react";
import {
  IconBrain,
  IconSettings,
  IconCheck,
  IconError,
  IconSpinner,
  IconSparkle,
  IconSearch,
  IconClose,
} from "../Icons";
import type { HealthStatus } from "../../hooks/useOllamaConfig";
import type { OllamaConfig } from "../../hooks/useOllamaConfig";

interface SettingsPanelProps {
  config: OllamaConfig;
  health: HealthStatus;
  healthLabel: string;
  saving: boolean;
  onCheckHealth: (url?: string, model?: string) => void;
  onSave: (url: string, model: string) => Promise<void>;
  onLoad: () => void;
  onClose?: () => void;
}

const KNOWN_MODELS = [
  { value: "llama3.2:3b", label: "Llama 3.2 (3B) — Nhanh" },
  { value: "llama3.2:1b", label: "Llama 3.2 (1B) — Siêu nhanh" },
  { value: "qwen2.5:7b", label: "Qwen 2.5 (7B) — Cân bằng" },
  { value: "qwen2.5:3b", label: "Qwen 2.5 (3B) — Nhanh" },
  { value: "mistral:7b", label: "Mistral (7B) — Chất lượng" },
  { value: "gemma2:9b", label: "Gemma 2 (9B) — Chất lượng cao" },
  { value: "codellama:7b", label: "CodeLlama (7B) — Code" },
  { value: "nomic-embed-text", label: "nomic-embed-text — Embedding" },
  { value: "custom", label: "Model khác..." },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  health,
  healthLabel,
  saving,
  onCheckHealth,
  onSave,
  onLoad,
  onClose,
}) => {
  const [url, setUrl] = useState(config.url);
  const [model, setModel] = useState(config.model);
  const [customModel, setCustomModel] = useState("");
  const [isCustom, setIsCustom] = useState(!KNOWN_MODELS.slice(0, -1).some((m) => m.value === config.model));
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    onLoad();
  }, [onLoad]);

  // Auto-check health on mount after config loads
  useEffect(() => {
    if (config.url && config.model) {
      const timer = setTimeout(() => onCheckHealth(), 500);
      return () => clearTimeout(timer);
    }
  }, [config.url, config.model]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setUrl(config.url);
    setModel(config.model);
    setIsCustom(!KNOWN_MODELS.slice(0, -1).some((m) => m.value === config.model));
  }, [config]);

  const handleModelSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "custom") {
      setIsCustom(true);
      setModel(customModel || "");
    } else {
      setIsCustom(false);
      setModel(val);
    }
  };

  const handleCheckHealth = () => {
    const finalModel = isCustom ? customModel : model;
    onCheckHealth(url, finalModel || undefined);
  };

  const handleSave = async () => {
    setSaveMsg(null);
    const finalModel = isCustom ? customModel : model;
    if (!finalModel.trim()) {
      setSaveMsg({ type: "error", text: "Vui lòng nhập tên model." });
      return;
    }
    try {
      await onSave(url, finalModel);
      setSaveMsg({ type: "success", text: "✅ Đã lưu cấu hình!" });
      // Re-check health with new config
      onCheckHealth(url, finalModel);
    } catch {
      setSaveMsg({ type: "error", text: "❌ Lưu thất bại." });
    }
  };

  const healthColor =
    health === "connected"
      ? "var(--color-success, #22c55e)"
      : health === "disconnected"
      ? "var(--color-error, #ef4444)"
      : "var(--color-text-muted)";

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2 className="settings-title">
          <IconSettings size={22} style={{ verticalAlign: "middle", marginRight: 8 }} />
          Cài đặt
        </h2>          {onClose && (
            <button className="chat-header-btn" onClick={onClose}>
              <IconClose size={16} />
            </button>
          )}
      </div>

      {/* Ollama Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <IconBrain size={18} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
          Ollama — AI Local
        </h3>
        <p className="settings-desc">
          MemoryOS sử dụng Ollama để chạy AI hoàn toàn trên máy tính của bạn.
          Đảm bảo Ollama đang chạy trước khi sử dụng Chat AI.
        </p>

        {/* Health Status */}
        <div className="settings-health" style={{ borderColor: healthColor }}>
          <div className="settings-health-indicator" style={{ background: healthColor }} />
          <div className="settings-health-info">
            <span className="settings-health-label">{healthLabel}</span>
            {(health === "disconnected" || health === "unknown") && (
              <span className="settings-health-hint">
                Chạy <code>ollama serve</code> trong terminal
              </span>
            )}
          </div>
          <button
            className="settings-health-btn"
            onClick={handleCheckHealth}
            disabled={health === "checking"}
          >
            {health === "checking" ? <IconSpinner size={16} /> : <IconSearch size={16} />}
            <span>Kiểm tra</span>
          </button>
        </div>

        {/* URL */}
        <div className="settings-field">
          <label className="settings-label">Ollama URL</label>
          <input
            type="text"
            className="settings-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:11434"
          />
        </div>

        {/* Model */}
        <div className="settings-field">
          <label className="settings-label">Model</label>
          <select
            className="settings-select"
            value={isCustom ? "custom" : model}
            onChange={handleModelSelect}
          >
            {KNOWN_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {isCustom && (
            <input
              type="text"
              className="settings-input"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="Nhập tên model (vd: llama3.2:3b)"
              style={{ marginTop: 8 }}
            />
          )}
        </div>

        {/* Quick actions */}
        <div className="settings-quick">
          <span className="settings-quick-label">Mẫu câu lệnh:</span>
          <code className="settings-quick-code">ollama pull qwen2.5:7b</code>
          <code className="settings-quick-code">ollama serve</code>
        </div>

        {/* Save button + message */}
        <div className="settings-actions">
          <button
            className="settings-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <IconSpinner size={16} /> : <IconCheck size={16} />}
            <span>{saving ? "Đang lưu..." : "Lưu cấu hình"}</span>
          </button>
          {saveMsg && (
            <span
              className="settings-save-msg"
              style={{
                color:
                  saveMsg.type === "success"
                    ? "var(--color-success, #22c55e)"
                    : "var(--color-error, #ef4444)",
              }}
            >
              {saveMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* About section */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <IconSparkle size={18} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} />
          Về MemoryOS
        </h3>
        <div className="settings-about">
          <p>Phiên bản: <strong>0.1.0</strong></p>
          <p>
            MemoryOS là một hệ điều hành trí nhớ cá nhân.
            <br />
            Dữ liệu của bạn được lưu hoàn toàn trên máy tính,
            <br />
            không upload lên Internet nếu không có sự đồng ý.
          </p>
          <div className="settings-about-links">
            <span>🔒 Local First</span>
            <span>🔑 Zero Knowledge</span>
            <span>📁 File Index</span>
            <span>🧠 AI Local</span>
          </div>
        </div>
      </div>
    </div>
  );
};
