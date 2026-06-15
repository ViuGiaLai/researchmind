import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { IconBrain, IconSpinner, IconCheck, IconLock, IconSparkle } from "../Icons";

interface Props {
  onComplete: () => void;
}

interface SpecsResult {
  total_ram_gb: number;
  cpu_cores: number;
  suggested_tier: string;
  suggested_model: string;
}

type Step = "welcome" | "mode" | "cloud" | "local" | "done";

export const AISetupWizard: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>("welcome");
  const [specs, setSpecs] = useState<SpecsResult | null>(null);
  const [specsLoading, setSpecsLoading] = useState(true);
  const [llmMode, setLlmMode] = useState<"cloud" | "local">("cloud");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>("medium");

  useEffect(() => {
    loadSpecs();
  }, []);

  const loadSpecs = async () => {
    setSpecsLoading(true);
    try {
      const s = await api.detectSpecs();
      setSpecs(s);
      setSelectedTier(s.suggested_tier);
    } catch {
      // Fallback specs
      setSpecs({
        total_ram_gb: 8,
        cpu_cores: 4,
        suggested_tier: "medium",
        suggested_model: "qwen2.5:7b",
      });
    } finally {
      setSpecsLoading(false);
    }
  };

  const handleChooseMode = (mode: "cloud" | "local") => {
    setLlmMode(mode);
    if (mode === "cloud") {
      setStep("cloud");
    } else {
      setStep("local");
    }
  };

  const handleSaveCloud = async () => {
    if (!claudeApiKey.trim()) {
      setSaveMsg("Vui lòng nhập Claude API Key");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.updateSettings({
        llm_mode: "cloud",
        claude_api_key: claudeApiKey,
        claude_model: "claude-sonnet-4-20250514",
      });
      setStep("done");
    } catch (e) {
      setSaveMsg(`Lỗi: ${e instanceof Error ? e.message : "Không thể lưu"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLocal = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const modelMap: Record<string, string> = {
        weak: specs?.suggested_model || "qwen2.5:3b",
        medium: specs?.suggested_model || "qwen2.5:7b",
        strong: specs?.suggested_model || "qwen2.5:14b",
      };
      await api.updateSettings({
        llm_mode: "local",
        ollama_model: modelMap[selectedTier],
      });
      setStep("done");
    } catch (e) {
      setSaveMsg(`Lỗi: ${e instanceof Error ? e.message : "Không thể lưu"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSkipCloud = async () => {
    // Save cloud mode without API key (will try local fallback)
    setSaving(true);
    try {
      await api.updateSettings({ llm_mode: "cloud" });
      setStep("done");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="aiwizard-overlay">
      <div className="aiwizard-card">
        {/* Welcome */}
        {step === "welcome" && (
          <div className="aiwizard-step">
            <div className="aiwizard-logo">
              <IconBrain size={48} className="icon-gradient" />
            </div>
            <h1 className="aiwizard-title">Chào mừng đến với ResearchMind VN</h1>
            <p className="aiwizard-desc">
              Trợ lý AI giúp bạn tìm kiếm và phân tích tài liệu nghiên cứu.
              <br />
              Mọi dữ liệu đều ở trên máy bạn. 🔒
            </p>
            {specsLoading ? (
              <div className="aiwizard-loading">
                <IconSpinner size={20} /> Đang phát hiện cấu hình máy...
              </div>
            ) : specs ? (
              <div className="aiwizard-specs">
                <div className="aiwizard-spec-row">
                  <span>🖥️ RAM</span>
                  <strong>{specs.total_ram_gb} GB</strong>
                </div>
                <div className="aiwizard-spec-row">
                  <span>⚡ CPU</span>
                  <strong>{specs.cpu_cores} cores</strong>
                </div>
              </div>
            ) : null}
            <button className="aiwizard-btn-primary" onClick={() => setStep("mode")}>
              Bắt đầu →
            </button>
          </div>
        )}

        {/* Choose mode */}
        {step === "mode" && (
          <div className="aiwizard-step">
            <h2 className="aiwizard-title" style={{ fontSize: "1.4rem" }}>
              Chọn chế độ AI
            </h2>
            <p className="aiwizard-desc">
              Bạn muốn dùng AI kiểu nào? Có thể đổi sau bất cứ lúc nào.
            </p>

            <div className="aiwizard-mode-cards">
              <button
                className={`aiwizard-mode-card ${specs && specs.total_ram_gb < 8 ? "recommended" : ""}`}
                onClick={() => handleChooseMode("cloud")}
              >
                <div className="aiwizard-mode-icon">☁️</div>
                <div className="aiwizard-mode-title">Dễ dùng (Khuyên dùng)</div>
                <div className="aiwizard-mode-desc">
                  Không cần cài gì thêm.
                  <br />
                  AI chạy qua Claude API.
                  <br />
                  Chỉ cần nhập API key.
                </div>
                {specs && specs.total_ram_gb < 8 && (
                  <div className="aiwizard-mode-badge">✅ Phù hợp máy bạn</div>
                )}
              </button>

              <button
                className={`aiwizard-mode-card ${specs && specs.total_ram_gb >= 8 ? "recommended" : ""}`}
                onClick={() => handleChooseMode("local")}
              >
                <div className="aiwizard-mode-icon">🔒</div>
                <div className="aiwizard-mode-title">Riêng tư tuyệt đối</div>
                <div className="aiwizard-mode-desc">
                  Tải model về máy.
                  <br />
                  Chạy offline hoàn toàn.
                  <br />
                  Miễn phí, không cần internet.
                </div>
                {specs && specs.total_ram_gb >= 8 && (
                  <div className="aiwizard-mode-badge">✅ Máy bạn đủ mạnh</div>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Cloud setup */}
        {step === "cloud" && (
          <div className="aiwizard-step">
            <h2 className="aiwizard-title" style={{ fontSize: "1.3rem" }}>
              ☁️ Cấu hình Cloud
            </h2>
            <p className="aiwizard-desc">
              Nhập Claude API Key để dùng AI mà không cần tải model.
            </p>

            <div className="aiwizard-field">
              <label className="aiwizard-label">Claude API Key</label>
              <div className="aiwizard-key-row">
                <input
                  type={showApiKey ? "text" : "password"}
                  className="aiwizard-input"
                  value={claudeApiKey}
                  onChange={(e) => setClaudeApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                />
                <button
                  className="aiwizard-toggle-btn"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? "🙈" : "👁️"}
                </button>
              </div>
              <p className="aiwizard-hint">
                🔒 API key được lưu trên máy bạn.
                <br />
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="aiwizard-link">
                  Lấy API key tại đây →
                </a>
              </p>
            </div>

            {saveMsg && <p className="aiwizard-error">{saveMsg}</p>}

            <div className="aiwizard-actions">
              <button className="aiwizard-btn-primary" onClick={handleSaveCloud} disabled={saving}>
                {saving ? <IconSpinner size={16} /> : <IconCheck size={16} />}
                <span>{saving ? "Đang lưu..." : "Xác nhận"}</span>
              </button>
              <button className="aiwizard-btn-skip" onClick={handleSkipCloud} disabled={saving}>
                Bỏ qua, dùng Local
              </button>
            </div>
          </div>
        )}

        {/* Local setup */}
        {step === "local" && (
          <div className="aiwizard-step">
            <h2 className="aiwizard-title" style={{ fontSize: "1.3rem" }}>
              🔒 Cấu hình Local
            </h2>
            <p className="aiwizard-desc">
              Chọn cấp độ model phù hợp với máy bạn.
            </p>

            <div className="aiwizard-tiers">
              {["weak", "medium", "strong"].map((tier) => {
                const labels: Record<string, string> = {
                  weak: "🔹 Nhẹ (4-8GB RAM)",
                  medium: "🔸 Trung bình (8-16GB)",
                  strong: "🔶 Mạnh (16GB+)",
                };
                const models: Record<string, string> = {
                  weak: specs?.suggested_tier === "weak" ? specs.suggested_model : "qwen2.5:3b",
                  medium: specs?.suggested_tier === "medium" ? specs.suggested_model : "qwen2.5:7b",
                  strong: specs?.suggested_tier === "strong" ? specs.suggested_model : "qwen2.5:14b",
                };
                return (
                  <button
                    key={tier}
                    className={`aiwizard-tier-card ${selectedTier === tier ? "active" : ""} ${specs?.suggested_tier === tier ? "recommended" : ""}`}
                    onClick={() => setSelectedTier(tier)}
                  >
                    <div className="aiwizard-tier-info">
                      <span className="aiwizard-tier-name">{labels[tier]}</span>
                      <span className="aiwizard-tier-model">{models[tier]}</span>
                    </div>
                    <div className="aiwizard-tier-check">
                      {selectedTier === tier && <IconCheck size={18} />}
                    </div>
                    {specs?.suggested_tier === tier && (
                      <span className="aiwizard-tier-badge">Gợi ý</span>
                    )}
                  </button>
                );
              })}
            </div>

            {saveMsg && <p className="aiwizard-error">{saveMsg}</p>}

            <div className="aiwizard-actions">
              <button className="aiwizard-btn-primary" onClick={handleSaveLocal} disabled={saving}>
                {saving ? <IconSpinner size={16} /> : <IconCheck size={16} />}
                <span>{saving ? "Đang lưu..." : "Xác nhận"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="aiwizard-step">
            <div className="aiwizard-done-icon">🎉</div>
            <h2 className="aiwizard-title">Sẵn sàng!</h2>
            <p className="aiwizard-desc">
              Bạn đã cấu hình xong ResearchMind VN.
              <br />
              Hãy import PDF và bắt đầu nghiên cứu!
            </p>
            <button className="aiwizard-btn-primary" onClick={onComplete}>
              Bắt đầu sử dụng →
            </button>
          </div>
        )}

        {/* Step indicator */}
        <div className="aiwizard-steps">
          {["welcome", "mode", "config", "done"].map((s, i) => {
            const stepOrder = ["welcome", "mode", "config", "done"];
            const currentIdx = step === "cloud" || step === "local" ? stepOrder.indexOf("config") : stepOrder.indexOf(step);
            return (
              <div key={s} className={`aiwizard-step-dot ${currentIdx >= i ? "active" : ""}`} />
            );
          })}
        </div>
      </div>
    </div>
  );
};
