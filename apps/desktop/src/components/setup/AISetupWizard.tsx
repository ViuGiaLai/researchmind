import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  IconBrain,
  IconSpinner,
  IconCheck,
  IconZap,
  IconKey,
  IconLock,
  IconParty,
  IconEye,
  IconEyeOff,
  IconMonitor,
  IconCpu,
  IconRefresh,
  IconFolder,
  IconError,
} from "../Icons";

interface Props {
  onComplete: () => void;
}

interface SpecsResult {
  total_ram_gb: number;
  cpu_cores: number;
  suggested_tier: string;
  suggested_model: string;
}

type Step = "welcome" | "mode" | "cloud_custom" | "storage" | "local" | "done";

export const AISetupWizard: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>("welcome");
  const [specs, setSpecs] = useState<SpecsResult | null>(null);
  const [specsLoading, setSpecsLoading] = useState(true);
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [customProvider, setCustomProvider] = useState<"deepseek" | "gemini" | "claude">("deepseek");
  const [showDSKey, setShowDSKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>("medium");
  const [localStatus, setLocalStatus] = useState<"idle" | "checking" | "model_missing" | "pulling">("idle");
  const [pullProgress, setPullProgress] = useState(0);
  const [pullMessage, setPullMessage] = useState("");

  // ── Storage Path State ─────────────────────────────────────────
  const [chosenMode, setChosenMode] = useState<"cloud_free" | "cloud_custom" | "local" | null>(null);
  const [storagePath, setStoragePath] = useState("");
  const [diskSpace, setDiskSpace] = useState<{ free_gb: number; warning: boolean } | null>(null);

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

  useEffect(() => {
    if (step === "storage" && !storagePath) {
      loadDefaultStoragePath();
    }
  }, [step]);

  const loadDefaultStoragePath = async () => {
    try {
      const s = await api.stats();
      const path = s.data_dir || "";
      setStoragePath(path);
      if (path) {
        const space = await api.getDiskSpace(path);
        setDiskSpace(space);
      }
    } catch (e) {
      console.error("Failed to load default storage path:", e);
    }
  };

  const handleSelectStorageDir = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<string | null>("select_folder");
      if (selected) {
        setStoragePath(selected);
        const space = await api.getDiskSpace(selected);
        setDiskSpace(space);
      }
    } catch (e) {
      console.error("Failed to select directory:", e);
    }
  };

  const handleSaveStorage = async () => {
    if (!storagePath) {
      setSaveMsg("Vui lòng chọn thư mục lưu trữ.");
      return;
    }
    setSaving(true);
    setSaveMsg("Đang thiết lập thư mục lưu trữ...");
    try {
      await api.moveStorage(storagePath);
      
      if (chosenMode === "local") {
        setStep("local");
        setSaveMsg(null);
      } else {
        await api.updateSettings({
          setup_completed: true,
          llm_mode: chosenMode || "cloud_free",
        });
        setStep("done");
      }
    } catch (e) {
      setSaveMsg(`Lỗi cấu hình lưu trữ: ${e instanceof Error ? e.message : "Lỗi không xác định"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChooseMode = async (mode: "cloud_free" | "cloud_custom" | "local") => {
    setSaveMsg(null);
    if (mode === "cloud_free") {
      setChosenMode("cloud_free");
      setStep("storage");
    } else if (mode === "cloud_custom") {
      setStep("cloud_custom");
    } else {
      setChosenMode("local");
      setStep("storage");
    }
  };

  const handleSaveCustom = async () => {
    const activeKey =
      customProvider === "deepseek"
        ? deepseekApiKey
        : customProvider === "gemini"
        ? geminiApiKey
        : claudeApiKey;
    if (!activeKey.trim()) {
      setSaveMsg(
        `Vui lòng nhập API Key cho ${
          customProvider === "deepseek"
            ? "DeepSeek"
            : customProvider === "gemini"
            ? "Gemini"
            : "Claude"
        }`
      );
      return;
    }
    setSaving(true);
    setSaveMsg("Đang kiểm tra kết nối API Key...");
    try {
      const val = await api.validateApiKey(customProvider, activeKey);
      if (!val.valid) {
        setSaveMsg(`Không thể kết nối đến API Key: ${val.error || "Không xác định"}`);
        setSaving(false);
        return;
      }

      await api.updateSettings({
        llm_mode: "cloud_custom",
        custom_cloud_provider: customProvider,
        deepseek_api_key: deepseekApiKey,
        gemini_api_key: geminiApiKey,
        claude_api_key: claudeApiKey,
      });
      setChosenMode("cloud_custom");
      setStep("storage");
      setSaveMsg(null);
    } catch (e) {
      setSaveMsg(`Lỗi: ${e instanceof Error ? e.message : "Không thể lưu"}`);
    } finally {
      setSaving(false);
    }
  };

  const startPullingModel = async (modelName: string) => {
    setLocalStatus("pulling");
    setPullProgress(0);
    setPullMessage("Bắt đầu tải model từ Ollama...");
    setSaveMsg(null);

    try {
      const response = await fetch(api.pullOllamaModelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Không hỗ trợ stream dữ liệu tải.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const payload = JSON.parse(trimmed.slice(6));
              
              if (payload.status === "error") {
                throw new Error(payload.message || "Lỗi tải model");
              }

              if (payload.status === "downloading" && payload.total) {
                const percent = Math.round((payload.completed / payload.total) * 100);
                setPullProgress(percent);
                setPullMessage(`Đang tải: ${percent}% (${Math.round(payload.completed / 1024 / 1024)}MB / ${Math.round(payload.total / 1024 / 1024)}MB)`);
              } else if (payload.status === "success") {
                setPullProgress(100);
                setPullMessage("Tải thành công! Đang cấu hình ứng dụng...");
              } else if (payload.status) {
                setPullMessage(`Trạng thái: ${payload.status}`);
              }
            } catch (err) {
              console.error("Lỗi parse JSON stream:", err);
            }
          }
        }
      }

      await api.updateSettings({
        llm_mode: "local",
        ollama_model: modelName,
        setup_completed: true,
      });
      setStep("done");
    } catch (e) {
      setLocalStatus("model_missing");
      setSaveMsg(`Lỗi tải model: ${e instanceof Error ? e.message : "Lỗi không xác định"}`);
    }
  };

  const handleSaveLocal = async () => {
    const modelMap: Record<string, string> = {
      weak: specs?.suggested_tier === "weak" ? specs.suggested_model : "qwen2.5:3b",
      medium: specs?.suggested_tier === "medium" ? specs.suggested_model : "qwen2.5:7b",
      strong: specs?.suggested_tier === "strong" ? specs.suggested_model : "qwen2.5:14b",
    };
    const targetModel = modelMap[selectedTier] || "qwen2.5:7b";

    setSaving(true);
    setSaveMsg("Đang kiểm tra kết nối đến Ollama...");
    setLocalStatus("checking");

    try {
      const status = await api.getOllamaStatus();
      if (!status.connected) {
        setSaveMsg(`Không thể kết nối đến Ollama. Vui lòng kiểm tra lại xem ứng dụng Ollama đã được bật trên máy chưa (cổng 11434).`);
        setLocalStatus("idle");
        setSaving(false);
        return;
      }

      const models = status.models || [];
      const hasModel = models.some(m => m.toLowerCase().includes(targetModel.toLowerCase()));

      if (hasModel) {
        await api.updateSettings({
          llm_mode: "local",
          ollama_model: targetModel,
          setup_completed: true,
        });
        setStep("done");
      } else {
        setLocalStatus("model_missing");
        setSaveMsg(null);
      }
    } catch (e) {
      setSaveMsg(`Lỗi: ${e instanceof Error ? e.message : "Không thể cấu hình"}`);
      setLocalStatus("idle");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="aiwizard-overlay">
      <div className="aiwizard-card" style={step === "mode" ? { maxWidth: "800px" } : {}}>
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
              Mọi dữ liệu đều ở trên máy bạn. <IconLock size={16} style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 4 }} />
            </p>
            {specsLoading ? (
              <div className="aiwizard-loading">
                <IconSpinner size={20} /> Đang phát hiện cấu hình máy...
              </div>
            ) : specs ? (
              <div className="aiwizard-specs">
                <div className="aiwizard-spec-row">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconMonitor size={16} /> RAM</span>
                  <strong>{specs.total_ram_gb} GB</strong>
                </div>
                <div className="aiwizard-spec-row">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconCpu size={16} /> CPU</span>
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
          <div className="aiwizard-step" style={{ width: "100%" }}>
            <h2 className="aiwizard-title" style={{ fontSize: "1.4rem" }}>
              Chọn chế độ AI
            </h2>
            <p className="aiwizard-desc">
              Bạn muốn dùng AI kiểu nào? Có thể đổi sau bất cứ lúc nào.
            </p>

            <div className="aiwizard-mode-cards" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", width: "100%" }}>
              <button
                className={`aiwizard-mode-card ${chosenMode === "cloud_free" ? "active" : ""} recommended`}
                onClick={() => handleChooseMode("cloud_free")}
                disabled={saving}
                style={{ flex: "none" }}
              >
                {chosenMode === "cloud_free" && (
                  <div className="aiwizard-mode-active-badge">
                    <IconCheck size={12} />
                  </div>
                )}
                <div className="aiwizard-mode-icon"><IconZap size={28} /></div>
                <div className="aiwizard-mode-title">Cloud Free</div>
                <div className="aiwizard-mode-desc">
                  Dùng qua Gemini API.
                  <br />
                  Giới hạn 10 câu/ngày.
                  <br />
                  Chạy ngay không cần cài đặt.
                </div>
                <div className="aiwizard-mode-badge" style={{ background: "var(--color-primary, #8b5cf6)" }}>Khuyên dùng</div>
              </button>

              <button
                className={`aiwizard-mode-card ${chosenMode === "cloud_custom" ? "active" : ""}`}
                onClick={() => handleChooseMode("cloud_custom")}
                disabled={saving}
                style={{ flex: "none" }}
              >
                {chosenMode === "cloud_custom" && (
                  <div className="aiwizard-mode-active-badge">
                    <IconCheck size={12} />
                  </div>
                )}
                <div className="aiwizard-mode-icon"><IconKey size={28} /></div>
                <div className="aiwizard-mode-title">Custom Key</div>
                <div className="aiwizard-mode-desc">
                  Không giới hạn.
                  <br />
                  Nhập key riêng.
                  <br />
                  Tự chi trả chi phí API.
                </div>
              </button>

              <button
                className={`aiwizard-mode-card ${chosenMode === "local" ? "active" : ""}`}
                onClick={() => handleChooseMode("local")}
                disabled={saving}
                style={{ flex: "none" }}
              >
                {chosenMode === "local" && (
                  <div className="aiwizard-mode-active-badge">
                    <IconCheck size={12} />
                  </div>
                )}
                <div className="aiwizard-mode-icon"><IconLock size={28} /></div>
                <div className="aiwizard-mode-title">Offline Cục Bộ</div>
                <div className="aiwizard-mode-desc">
                  Bảo mật tuyệt đối.
                  <br />
                  Không cần internet.
                  <br />
                  Cần tải model (~5GB).
                </div>
                {specs && specs.total_ram_gb >= 8 && (
                  <div className="aiwizard-mode-badge" style={{ background: "var(--color-success, #10b981)" }}>Máy bạn đủ mạnh</div>
                )}
              </button>
            </div>
            {saveMsg && <p className="aiwizard-error" style={{ marginTop: "12px" }}>{saveMsg}</p>}
          </div>
        )}

        {/* Custom Cloud setup */}
        {step === "cloud_custom" && (
          <div className="aiwizard-step">
            <h2 className="aiwizard-title" style={{ fontSize: "1.3rem", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <IconKey size={20} /> Cấu hình Custom Key
            </h2>
            <p className="aiwizard-desc">
              Nhập API Key cá nhân của bạn để sử dụng không giới hạn.
            </p>

            <div className="provider-tabs" style={{ display: "flex", gap: "8px", width: "100%", marginBottom: "16px" }}>
              {["deepseek", "gemini", "claude"].map((provider) => {
                const isActive = customProvider === provider;
                const labels: Record<string, string> = {
                  deepseek: "DeepSeek (Rẻ)",
                  gemini: "Gemini (Nhanh)",
                  claude: "Claude (Chất lượng)"
                };
                return (
                  <button
                    key={provider}
                    className="provider-tab-btn"
                    onClick={() => setCustomProvider(provider as any)}
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

            {customProvider === "deepseek" && (
              <div className="aiwizard-field" style={{ width: "100%" }}>
                <label className="aiwizard-label">DeepSeek API Key</label>
                <div className="aiwizard-key-row">
                  <input
                    type={showDSKey ? "text" : "password"}
                    className="aiwizard-input"
                    value={deepseekApiKey}
                    onChange={(e) => setDeepseekApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                  <button
                    className="aiwizard-toggle-btn"
                    onClick={() => setShowDSKey(!showDSKey)}
                  >
                    {showDSKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </button>
                </div>
                <p className="aiwizard-hint" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <IconLock size={12} /> API key được lưu cục bộ trên máy bạn.
                </p>
                <p className="aiwizard-hint" style={{ marginTop: "4px" }}>
                  <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" className="aiwizard-link">
                    Lấy API key tại đây (nạp ~2$ dùng thoải mái) →
                  </a>
                </p>
              </div>
            )}

            {customProvider === "gemini" && (
              <div className="aiwizard-field" style={{ width: "100%" }}>
                <label className="aiwizard-label">Gemini API Key</label>
                <div className="aiwizard-key-row">
                  <input
                    type={showGeminiKey ? "text" : "password"}
                    className="aiwizard-input"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                  />
                  <button
                    className="aiwizard-toggle-btn"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                  >
                    {showGeminiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </button>
                </div>
                <p className="aiwizard-hint" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <IconLock size={12} /> API key được lưu cục bộ trên máy bạn.
                </p>
                <p className="aiwizard-hint" style={{ marginTop: "4px" }}>
                  <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="aiwizard-link">
                    Lấy API key tại đây (Miễn phí rate limit) →
                  </a>
                </p>
              </div>
            )}

            {customProvider === "claude" && (
              <div className="aiwizard-field" style={{ width: "100%" }}>
                <label className="aiwizard-label">Claude API Key</label>
                <div className="aiwizard-key-row">
                  <input
                    type={showClaudeKey ? "text" : "password"}
                    className="aiwizard-input"
                    value={claudeApiKey}
                    onChange={(e) => setClaudeApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                  />
                  <button
                    className="aiwizard-toggle-btn"
                    onClick={() => setShowClaudeKey(!showClaudeKey)}
                  >
                    {showClaudeKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </button>
                </div>
                <p className="aiwizard-hint" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <IconLock size={12} /> API key được lưu cục bộ trên máy bạn.
                </p>
                <p className="aiwizard-hint" style={{ marginTop: "4px" }}>
                  <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="aiwizard-link">
                    Lấy API key tại đây →
                  </a>
                </p>
              </div>
            )}

            {saveMsg && <p className="aiwizard-error">{saveMsg}</p>}

            <div className="aiwizard-actions">
              <button className="aiwizard-btn-primary" onClick={handleSaveCustom} disabled={saving}>
                {saving ? <IconSpinner size={16} /> : <IconCheck size={16} />}
                <span>{saving ? "Đang lưu..." : "Xác nhận"}</span>
              </button>
              <button className="aiwizard-btn-skip" onClick={() => setStep("mode")} disabled={saving}>
                Quay lại
              </button>
            </div>
          </div>
        )}

        {/* Local setup */}
        {step === "local" && (
          <div className="aiwizard-step">
            <h2 className="aiwizard-title" style={{ fontSize: "1.3rem", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <IconLock size={20} /> Cấu hình Local
            </h2>

            {localStatus === "model_missing" ? (
              <div className="aiwizard-model-missing" style={{ width: "100%", textAlign: "center" }}>
                <p style={{ margin: "16px 0", fontSize: "0.95rem" }}>
                  Máy đã kết nối được đến Ollama. Tuy nhiên, model <strong>{
                    selectedTier === "weak" ? (specs?.suggested_tier === "weak" ? specs.suggested_model : "qwen2.5:3b") :
                    selectedTier === "medium" ? (specs?.suggested_tier === "medium" ? specs.suggested_model : "qwen2.5:7b") :
                    (specs?.suggested_tier === "strong" ? specs.suggested_model : "qwen2.5:14b")
                  }</strong> chưa được cài đặt.
                </p>
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginBottom: 20 }}>
                  Model này nặng khoảng 2.0GB - 4.7GB tùy cấp độ bạn đã chọn.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
                  <button
                    className="aiwizard-btn-primary"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    onClick={() => {
                      const modelMap: Record<string, string> = {
                        weak: specs?.suggested_tier === "weak" ? specs.suggested_model : "qwen2.5:3b",
                        medium: specs?.suggested_tier === "medium" ? specs.suggested_model : "qwen2.5:7b",
                        strong: specs?.suggested_tier === "strong" ? specs.suggested_model : "qwen2.5:14b",
                      };
                      startPullingModel(modelMap[selectedTier] || "qwen2.5:7b");
                    }}
                  >
                    <IconZap size={16} /> Tải model tự động trực tiếp trên app
                  </button>
                  <button
                    className="aiwizard-btn-skip"
                    onClick={handleSaveLocal}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      padding: "10px", borderRadius: "6px", border: "1px solid var(--border-color, #e2e8f0)",
                      background: "transparent", cursor: "pointer", color: "var(--color-text)", fontWeight: "bold"
                    }}
                  >
                    <IconRefresh size={16} /> Tôi đã tự chạy 'ollama pull' thủ công - Kiểm tra lại
                  </button>
                  <button
                    className="aiwizard-btn-skip"
                    onClick={() => setLocalStatus("idle")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}
                  >
                    Quay lại chọn model tier
                  </button>
                </div>
              </div>
            ) : localStatus === "pulling" ? (
              <div className="aiwizard-model-pulling" style={{ width: "100%", textAlign: "center", padding: "20px 0" }}>
                <IconSpinner size={32} style={{ marginBottom: "16px" }} />
                <p style={{ fontWeight: "bold", marginBottom: "8px" }}>{pullMessage}</p>
                <div className="pull-progress-bar-track" style={{ width: "100%", height: "8px", background: "var(--border-color, #e2e8f0)", borderRadius: "4px", overflow: "hidden", marginBottom: "12px" }}>
                  <div className="pull-progress-bar-fill" style={{ width: `${pullProgress}%`, height: "100%", background: "var(--color-primary, #6366f1)", transition: "width 0.2s ease" }} />
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Vui lòng không tắt ứng dụng khi đang tải.</p>
              </div>
            ) : (
              <>
                <p className="aiwizard-desc">
                  Chọn cấp độ model phù hợp với máy bạn.
                </p>

                <div className="aiwizard-tiers">
                  {["weak", "medium", "strong"].map((tier) => {
                    const labels: Record<string, string> = {
                      weak: "Nhẹ (4-8GB RAM)",
                      medium: "Trung bình (8-16GB)",
                      strong: "Mạnh (16GB+)",
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
                  <button className="aiwizard-btn-skip" onClick={() => setStep("mode")} disabled={saving}>
                    Quay lại
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Storage setup */}
        {step === "storage" && (
          <div className="aiwizard-step" style={{ width: "100%" }}>
            <div className="aiwizard-logo">
              <IconFolder size={48} className="icon-gradient" />
            </div>
            <h2 className="aiwizard-title">Chọn thư mục lưu trữ</h2>
            
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              padding: "12px 16px",
              borderRadius: "8px",
              background: "rgba(139, 92, 246, 0.1)",
              border: "1px solid rgba(139, 92, 246, 0.2)",
              marginBottom: "20px",
              width: "100%",
              textAlign: "left"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold", fontSize: "0.95rem", color: "var(--color-primary)" }}>
                <IconCheck size={16} style={{ color: "var(--color-success)" }} />
                <span>Chế độ AI đã chọn: {
                  chosenMode === "cloud_free" ? "Cloud Free (Gemini API)" :
                  chosenMode === "cloud_custom" ? "Custom Key (API Key riêng)" :
                  "Offline Cục Bộ (AI Offline)"
                }</span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", margin: 0, paddingLeft: "24px", lineHeight: "1.4" }}>
                {chosenMode === "local" 
                  ? "Cần ổ đĩa trống từ 5GB trở lên để chứa mô hình AI cục bộ từ Ollama."
                  : "Mặc dù dùng AI qua Cloud, tài liệu nghiên cứu (PDF) và dữ liệu tìm kiếm của bạn vẫn được lưu trữ và bảo mật 100% cục bộ trên máy tính của bạn."
                }
              </p>
            </div>

            <div className="aiwizard-field" style={{ width: "100%", textAlign: "left" }}>
              <label className="aiwizard-label" style={{ cursor: "pointer" }} onClick={handleSelectStorageDir}>Đường dẫn dữ liệu hiện tại:</label>
              <div className="aiwizard-key-row" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  className="aiwizard-input"
                  value={storagePath}
                  readOnly
                  placeholder="Chọn thư mục..."
                  style={{ flex: 1, cursor: "pointer" }}
                  onClick={handleSelectStorageDir}
                />
                <button
                  className="aiwizard-btn-primary"
                  style={{ width: "auto", padding: "0 16px", borderRadius: "6px", height: "42px", flexShrink: 0, margin: 0 }}
                  onClick={handleSelectStorageDir}
                  disabled={saving}
                >
                  Thay đổi...
                </button>
              </div>
              
              {diskSpace && (
                <div style={{ marginTop: "16px", padding: "12px", borderRadius: "8px", background: "var(--color-bg, rgba(0,0,0,0.02))", border: "1px solid var(--border-color, #e2e8f0)" }}>
                  <div style={{ fontSize: "0.9rem", display: "flex", justifyContent: "space-between" }}>
                    <span>Dung lượng ổ đĩa trống:</span>
                    <strong style={{ color: diskSpace.warning ? "#ef4444" : "#22c55e" }}>
                      {diskSpace.free_gb} GB
                    </strong>
                  </div>
                  {diskSpace.warning && (
                    <p style={{ marginTop: "8px", fontSize: "0.8rem", color: "#ef4444", display: "flex", alignItems: "center", gap: "6px", lineHeight: "1.4" }}>
                      <IconError size={14} style={{ flexShrink: 0 }} /> Cảnh báo: Ổ đĩa đích còn ít dung lượng. Khuyên bạn nên chọn ổ đĩa khác (như ổ D:, E:) để tránh đầy ổ hệ thống.
                    </p>
                  )}
                </div>
              )}
            </div>

            {saveMsg && <p className="aiwizard-error" style={{ marginTop: "12px" }}>{saveMsg}</p>}

            <div className="aiwizard-actions" style={{ marginTop: "24px" }}>
              <button className="aiwizard-btn-primary" onClick={handleSaveStorage} disabled={saving}>
                {saving ? <IconSpinner size={16} /> : <IconCheck size={16} />}
                <span>{saving ? "Đang thiết lập..." : "Tiếp tục"}</span>
              </button>
              <button className="aiwizard-btn-skip" onClick={() => setStep(chosenMode === "cloud_custom" ? "cloud_custom" : "mode")} disabled={saving}>
                Quay lại
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="aiwizard-step">
            <div className="aiwizard-done-icon">
              <IconParty size={48} />
            </div>
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
          {["welcome", "mode", "config", "storage", "done"].map((s, i) => {
            const stepOrder = ["welcome", "mode", "config", "storage", "done"];
            let currentIdx = stepOrder.indexOf(step);
            if (step === "cloud_custom" || step === "local") {
              currentIdx = stepOrder.indexOf("config");
            }
            return (
              <div key={s} className={`aiwizard-step-dot ${currentIdx >= i ? "active" : ""}`} />
            );
          })}
        </div>
      </div>
    </div>
  );
};
