import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  IconBrain,
  IconSpinner,
  IconCheck,
  IconZap,
  IconKey,
  IconLock,
  IconEye,
  IconEyeOff,
  IconMonitor,
  IconCpu,
  IconRefresh,
  IconFolder,
  IconError,
  IconSparkle,
  IconSearch,
  IconSettings,
  IconDownload,
} from "../Icons";
import { OllamaErrorBanner } from "../shared/OllamaErrorBanner";
import "./AISetupWizard.css";

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
  const [scanStep, setScanStep] = useState<"none" | "cpu" | "ram" | "storage" | "complete">("none");
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
  const [localStatus, setLocalStatus] = useState<"idle" | "checking" | "model_missing" | "pulling" | "ollama_unreachable">("idle");
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

  // Hardware Scan Animation Sequence
  useEffect(() => {
    let t1: any, t2: any, t3: any;
    if (!specsLoading && specs && scanStep === "none") {
      setScanStep("cpu");
      t1 = setTimeout(() => {
        setScanStep("ram");
        t2 = setTimeout(() => {
          setScanStep("storage");
          t3 = setTimeout(() => {
            setScanStep("complete");
          }, 500);
        }, 500);
      }, 500);
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [specsLoading, specs]);

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

  const handleNextFromMode = () => {
    if (!chosenMode) return;
    setSaveMsg(null);
    if (chosenMode === "cloud_free") {
      setStep("storage");
    } else if (chosenMode === "cloud_custom") {
      setStep("cloud_custom");
    } else if (chosenMode === "local") {
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
        setSaveMsg(`Không thể kết nối đến Ollama (cổng 11434). Vui lòng khởi động Ollama trên máy tính của bạn.`);
        setLocalStatus("ollama_unreachable");
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
      <div className="aiwizard-glow-bg-1" />
      <div className="aiwizard-glow-bg-2" />

      <div className="aiwizard-card" style={step === "mode" ? { maxWidth: "880px" } : {}}>
        {/* Welcome Step */}
        {step === "welcome" && (
          <div className="aiwizard-step welcome-step">
            <div className="aiwizard-logo logo-pulse">
              <IconBrain size={56} className="icon-gradient" />
            </div>
            <h1 className="aiwizard-title">Chào mừng đến với ResearchMind</h1>
            <p className="aiwizard-desc">
              Trợ lý nghiên cứu khoa học thông minh của bạn. Tự động lập chỉ mục, tóm tắt, 
              phản biện chuyên sâu và kết nối các bài báo học thuật một cách bảo mật.
            </p>

            {specsLoading ? (
              <div className="aiwizard-scanner-loading">
                <IconSpinner size={24} className="icon-spin text-primary" />
                <span>Đang phân tích cấu hình phần cứng thiết bị...</span>
              </div>
            ) : (
              <div className="aiwizard-scan-hud">
                <div className="scan-hud-header">
                  <span className="scan-hud-title">🖥️ THÔNG TIN PHẦN CỨNG</span>
                  <span className={`scan-hud-status ${scanStep === "complete" ? "ready" : "scanning"}`}>
                    {scanStep === "complete" ? "HỆ THỐNG SẴN SÀNG" : "ĐANG DÒ QUÉT..."}
                  </span>
                </div>
                
                <div className="scan-hud-grid">
                  {/* CPU */}
                  <div className={`scan-hud-item ${scanStep !== "cpu" && scanStep !== "none" ? "scanned" : "scanning"}`}>
                    <div className="hud-icon"><IconCpu size={20} /></div>
                    <div className="hud-info">
                      <span className="hud-label">Vi xử lý (CPU)</span>
                      <span className="hud-value">
                        {scanStep === "cpu" ? "Đang quét nhân..." : `${specs?.cpu_cores} Cores`}
                      </span>
                    </div>
                    <div className="hud-check">
                      {scanStep === "cpu" ? <IconSpinner size={16} className="icon-spin" /> : <IconCheck size={16} />}
                    </div>
                  </div>

                  {/* RAM */}
                  <div className={`scan-hud-item ${(scanStep === "ram" || scanStep === "storage" || scanStep === "complete") ? (scanStep === "ram" ? "scanning" : "scanned") : "pending"}`}>
                    <div className="hud-icon"><IconMonitor size={20} /></div>
                    <div className="hud-info">
                      <span className="hud-label">Bộ nhớ (RAM)</span>
                      <span className="hud-value">
                        {scanStep === "cpu" ? "Chờ quét..." : scanStep === "ram" ? "Đang đo dung lượng..." : `${specs?.total_ram_gb} GB`}
                      </span>
                    </div>
                    <div className="hud-check">
                      {scanStep === "cpu" ? null : scanStep === "ram" ? <IconSpinner size={16} className="icon-spin" /> : <IconCheck size={16} />}
                    </div>
                  </div>

                  {/* Optimization Tier */}
                  <div className={`scan-hud-item ${(scanStep === "storage" || scanStep === "complete") ? (scanStep === "storage" ? "scanning" : "scanned") : "pending"} wide-column`}>
                    <div className="hud-icon"><IconBrain size={20} /></div>
                    <div className="hud-info">
                      <span className="hud-label">Cấu hình khuyến nghị tối ưu</span>
                      <span className="hud-value">
                        {(scanStep === "cpu" || scanStep === "ram") ? "Đang phân tích tối ưu..." : scanStep === "storage" ? "Đang tính toán tier..." : (
                          <span className={`tier-badge-glow ${specs?.suggested_tier}`}>
                            {specs?.suggested_tier === "weak" ? "Chạy Cloud (Khuyên dùng)" : specs?.suggested_tier === "medium" ? "Chạy Cloud / Local (Khuyên dùng)" : "Chạy Offline Cục Bộ (Tối ưu nhất)"}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="hud-check">
                      {(scanStep === "cpu" || scanStep === "ram") ? null : scanStep === "storage" ? <IconSpinner size={16} className="icon-spin" /> : <IconCheck size={16} />}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {scanStep === "complete" && (
              <button className="aiwizard-btn-primary animate-pulse-glow" onClick={() => setStep("mode")}>
                Bắt đầu thiết lập →
              </button>
            )}
          </div>
        )}

        {/* Choose Mode Step */}
        {step === "mode" && (
          <div className="aiwizard-step mode-step">
            <h2 className="aiwizard-title">🎯 Chọn chế độ AI hoạt động</h2>
            <p className="aiwizard-desc">
              ResearchMind hỗ trợ cả AI đám mây miễn phí/trả phí lẫn AI offline cục bộ để bảo mật dữ liệu. Hãy chọn tùy chọn phù hợp nhất.
            </p>

            <div className="aiwizard-mode-cards-grid">
              {/* Cloud Free Card */}
              <div 
                className={`aiwizard-mode-card-premium ${chosenMode === "cloud_free" ? "active cloud-free" : ""}`}
                onClick={() => setChosenMode("cloud_free")}
              >
                <div className="card-selection-glow" />
                <div className="card-header-icon"><IconZap size={28} /></div>
                <div className="card-content">
                  <h3 className="card-title">Cloud Free</h3>
                  <p className="card-subtitle">Gemini API miễn phí</p>
                  
                  <ul className="card-features">
                    <li><IconCheck size={14} /> Kích hoạt trong 3 giây</li>
                    <li><IconCheck size={14} /> Không mất phí dịch vụ</li>
                    <li><IconCheck size={14} /> Tốc độ phản hồi cực nhanh</li>
                    <li className="warning-feature"><IconLock size={14} /> Giới hạn 10 câu hỏi/ngày</li>
                  </ul>
                </div>
                <div className="card-badge recommended">Mặc định</div>
              </div>

              {/* Custom Key Card */}
              <div 
                className={`aiwizard-mode-card-premium ${chosenMode === "cloud_custom" ? "active cloud-custom" : ""}`}
                onClick={() => setChosenMode("cloud_custom")}
              >
                <div className="card-selection-glow" />
                <div className="card-header-icon"><IconKey size={28} /></div>
                <div className="card-content">
                  <h3 className="card-title">Custom Key</h3>
                  <p className="card-subtitle">Nhập API Key cá nhân</p>
                  
                  <ul className="card-features">
                    <li><IconCheck size={14} /> DeepSeek, Gemini, Claude</li>
                    <li><IconCheck size={14} /> Không giới hạn lượt hỏi</li>
                    <li><IconCheck size={14} /> Xử lý tài liệu siêu dài</li>
                    <li><IconCheck size={14} /> Chi phí API tự chi trả (rất rẻ)</li>
                  </ul>
                </div>
                <div className="card-badge info">Mở rộng</div>
              </div>

              {/* Local Offline Card */}
              <div 
                className={`aiwizard-mode-card-premium ${chosenMode === "local" ? "active local" : ""} ${specs && specs.total_ram_gb < 8 ? "disabled" : ""}`}
                onClick={() => {
                  if (specs && specs.total_ram_gb >= 8) {
                    setChosenMode("local");
                  }
                }}
              >
                <div className="card-selection-glow" />
                <div className="card-header-icon"><IconLock size={28} /></div>
                <div className="card-content">
                  <h3 className="card-title">Offline Cục Bộ</h3>
                  <p className="card-subtitle">Mô hình AI trên máy của bạn</p>
                  
                  <ul className="card-features">
                    <li><IconCheck size={14} /> Bảo mật dữ liệu tuyệt đối</li>
                    <li><IconCheck size={14} /> Không gửi PDF lên internet</li>
                    <li><IconCheck size={14} /> Miễn phí, không cần tài khoản</li>
                    <li className="note-feature"><IconCpu size={14} /> Cần cài Ollama & tải model (~5GB)</li>
                  </ul>
                </div>
                {specs && specs.total_ram_gb >= 8 ? (
                  <div className="card-badge success">Khuyên dùng cho máy bạn</div>
                ) : (
                  <div className="card-badge error">Yêu cầu RAM tối thiểu 8GB</div>
                )}
              </div>
            </div>

            <div className="aiwizard-actions-row">
              <button 
                className="aiwizard-btn-primary" 
                onClick={handleNextFromMode}
                disabled={!chosenMode}
              >
                Tiếp tục →
              </button>
              <button className="aiwizard-btn-skip" onClick={() => setStep("welcome")}>
                Quay lại
              </button>
            </div>
          </div>
        )}

        {/* Custom Cloud Setup */}
        {step === "cloud_custom" && (
          <div className="aiwizard-step cloud-custom-step">
            <h2 className="aiwizard-title">🔑 Cấu hình API Key</h2>
            <p className="aiwizard-desc">
              Nhập API Key cá nhân của bạn để sử dụng AI chất lượng cao không giới hạn.
            </p>

            <div className="provider-tabs">
              {["deepseek", "gemini", "claude"].map((provider) => {
                const isActive = customProvider === provider;
                const labels: Record<string, string> = {
                  deepseek: "DeepSeek API",
                  gemini: "Gemini API",
                  claude: "Claude API"
                };
                return (
                  <button
                    key={provider}
                    className={`provider-tab-btn-premium ${provider} ${isActive ? "active" : ""}`}
                    onClick={() => { setCustomProvider(provider as any); setSaveMsg(null); }}
                  >
                    <span className="provider-name">{labels[provider]}</span>
                  </button>
                );
              })}
            </div>

            <div className="provider-info-box-premium">
              {customProvider === "deepseek" && (
                <>
                  <IconSparkle size={16} className="info-box-sparkle" />
                  <span>
                    <strong>DeepSeek V3 / R1:</strong> Chi phí suy luận cực rẻ, hiệu năng lập luận mạnh mẽ. Mô hình sử dụng mặc định: <code>deepseek-chat</code>.
                  </span>
                </>
              )}
              {customProvider === "gemini" && (
                <>
                  <IconSparkle size={16} className="info-box-sparkle" />
                  <span>
                    <strong>Google Gemini:</strong> Tốc độ xử lý siêu tốc, cửa sổ ngữ cảnh (context window) khổng lồ hỗ trợ hàng chục file PDF cùng lúc.
                  </span>
                </>
              )}
              {customProvider === "claude" && (
                <>
                  <IconSparkle size={16} className="info-box-sparkle" />
                  <span>
                    <strong>Anthropic Claude 3.5 Sonnet:</strong> Trí tuệ AI đỉnh cao cho phân tích dữ liệu khoa học, phát hiện research gap và phản biện luận điểm.
                  </span>
                </>
              )}
            </div>

            <div className="aiwizard-field-premium">
              <label className="aiwizard-label">
                Nhập API Key cho {customProvider === "deepseek" ? "DeepSeek" : customProvider === "gemini" ? "Gemini" : "Claude"}:
              </label>
              <div className="aiwizard-input-wrapper">
                <span className="input-prefix-icon"><IconKey size={18} /></span>
                <input
                  type={
                    customProvider === "deepseek" ? (showDSKey ? "text" : "password") :
                    customProvider === "gemini" ? (showGeminiKey ? "text" : "password") :
                    (showClaudeKey ? "text" : "password")
                  }
                  className="aiwizard-input-premium"
                  value={
                    customProvider === "deepseek" ? deepseekApiKey :
                    customProvider === "gemini" ? geminiApiKey :
                    claudeApiKey
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (customProvider === "deepseek") setDeepseekApiKey(val);
                    else if (customProvider === "gemini") setGeminiApiKey(val);
                    else setClaudeApiKey(val);
                  }}
                  placeholder={
                    customProvider === "deepseek" ? "sk-..." :
                    customProvider === "gemini" ? "AIzaSy..." :
                    "sk-ant-..."
                  }
                />
                <button
                  type="button"
                  className="aiwizard-input-suffix-btn"
                  onClick={() => {
                    if (customProvider === "deepseek") setShowDSKey(!showDSKey);
                    else if (customProvider === "gemini") setShowGeminiKey(!showGeminiKey);
                    else setShowClaudeKey(!showClaudeKey);
                  }}
                >
                  {customProvider === "deepseek" ? (showDSKey ? <IconEyeOff size={18} /> : <IconEye size={18} />) :
                   customProvider === "gemini" ? (showGeminiKey ? <IconEyeOff size={18} /> : <IconEye size={18} />) :
                   (showClaudeKey ? <IconEyeOff size={18} /> : <IconEye size={18} />)}
                </button>
              </div>
              
              <div className="aiwizard-field-help-row">
                <span className="help-text"><IconLock size={12} /> Key được lưu an toàn 100% trên máy của bạn.</span>
                <a
                  href={
                    customProvider === "deepseek" ? "https://platform.deepseek.com/" :
                    customProvider === "gemini" ? "https://aistudio.google.com/" :
                    "https://console.anthropic.com/"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="help-link"
                >
                  Lấy API Key tại đây ↗
                </a>
              </div>
            </div>

            {saveMsg && <p className="aiwizard-error-message fade-in"><IconError size={16} /> {saveMsg}</p>}

            <div className="aiwizard-actions-row">
              <button className="aiwizard-btn-primary" onClick={handleSaveCustom} disabled={saving}>
                {saving ? <IconSpinner size={18} className="icon-spin" /> : <IconCheck size={18} />}
                <span>{saving ? "Đang xác thực API Key..." : "Xác nhận & Lưu Key"}</span>
              </button>
              <button className="aiwizard-btn-skip" onClick={() => setStep("mode")} disabled={saving}>
                Quay lại
              </button>
            </div>
          </div>
        )}

        {/* Local Setup */}
        {step === "local" && (
          <div className="aiwizard-step local-setup-step">
            <h2 className="aiwizard-title">🔒 Cấu hình AI Cục Bộ (Ollama)</h2>
            
            {localStatus === "ollama_unreachable" ? (
              <div className="aiwizard-ollama-unreachable-premium">
                <OllamaErrorBanner
                  title="Không tìm thấy dịch vụ Ollama đang chạy!"
                  message="Chế độ AI Cục bộ chạy hoàn toàn trên máy tính của bạn và yêu cầu ứng dụng Ollama hoạt động dưới nền."
                  showCommands
                  showDocLink
                />

                <div className="stepper-guide">
                  <div className="guide-card">
                    <div className="guide-badge-num">1</div>
                    <div className="guide-content">
                      <h4>Tải xuống Ollama</h4>
                      <p>Truy cập <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">ollama.com</a> để tải phiên bản cho Windows.</p>
                    </div>
                  </div>

                  <div className="guide-card">
                    <div className="guide-badge-num">2</div>
                    <div className="guide-content">
                      <h4>Cài đặt & Khởi động</h4>
                      <p>Khởi chạy file đã tải để cài đặt. Đảm bảo biểu tượng Ollama hiển thị dưới khay hệ thống (System Tray).</p>
                    </div>
                  </div>

                  <div className="guide-card">
                    <div className="guide-badge-num">3</div>
                    <div className="guide-content">
                      <h4>Kết nối lại</h4>
                      <p>Sau khi Ollama đã chạy dưới nền, nhấp nút kết nối lại phía dưới để tiếp tục.</p>
                    </div>
                  </div>
                </div>

                {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}

                <div className="aiwizard-actions-row">
                  <button className="aiwizard-btn-primary" onClick={handleSaveLocal} disabled={saving}>
                    {saving ? <IconSpinner size={18} className="icon-spin" /> : <IconRefresh size={18} />}
                    <span>{saving ? "Đang kết nối lại..." : "Thử kết nối lại"}</span>
                  </button>
                  <a 
                    href="https://ollama.com" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="aiwizard-btn-skip download-btn"
                  >
                    Tải Ollama từ trang chủ ↗
                  </a>
                  <button 
                    className="aiwizard-btn-skip" 
                    onClick={() => { setLocalStatus("idle"); setSaveMsg(null); }} 
                    disabled={saving}
                  >
                    Quay lại chọn cấu hình
                  </button>
                </div>
              </div>
            ) : localStatus === "model_missing" ? (
              <div className="aiwizard-model-missing-premium">
                <div className="info-banner">
                  <IconSparkle size={24} />
                  <span>Đã kết nối Ollama thành công!</span>
                </div>
                
                <p className="local-setup-desc">
                  Mô hình AI cục bộ <strong>{
                    selectedTier === "weak" ? (specs?.suggested_tier === "weak" ? specs.suggested_model : "qwen2.5:3b") :
                    selectedTier === "medium" ? (specs?.suggested_tier === "medium" ? specs.suggested_model : "qwen2.5:7b") :
                    (specs?.suggested_tier === "strong" ? specs.suggested_model : "qwen2.5:14b")
                  }</strong> chưa được tải về máy của bạn.
                </p>

                <div className="model-download-estimate-card">
                  <div className="estimate-row">
                    <span>Mô hình cần tải:</span>
                    <strong>{
                      selectedTier === "weak" ? (specs?.suggested_tier === "weak" ? specs.suggested_model : "qwen2.5:3b") :
                      selectedTier === "medium" ? (specs?.suggested_tier === "medium" ? specs.suggested_model : "qwen2.5:7b") :
                      (specs?.suggested_tier === "strong" ? specs.suggested_model : "qwen2.5:14b")
                    }</strong>
                  </div>
                  <div className="estimate-row">
                    <span>Kích thước tải:</span>
                    <strong>{selectedTier === "weak" ? "~2.0 GB" : selectedTier === "medium" ? "~4.7 GB" : "~9.0 GB"}</strong>
                  </div>
                  <div className="estimate-row">
                    <span>Thời gian ước tính:</span>
                    <strong>{selectedTier === "weak" ? "3-5 phút (mạng 100Mbps)" : selectedTier === "medium" ? "5-10 phút" : "15-20 phút"}</strong>
                  </div>
                </div>

                {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}

                <div className="aiwizard-actions-column">
                  <button
                    className="aiwizard-btn-primary download-model-btn"
                    onClick={() => {
                      const modelMap: Record<string, string> = {
                        weak: specs?.suggested_tier === "weak" ? specs.suggested_model : "qwen2.5:3b",
                        medium: specs?.suggested_tier === "medium" ? specs.suggested_model : "qwen2.5:7b",
                        strong: specs?.suggested_tier === "strong" ? specs.suggested_model : "qwen2.5:14b",
                      };
                      startPullingModel(modelMap[selectedTier] || "qwen2.5:7b");
                    }}
                  >
                    <IconDownload size={18} /> Tải mô hình tự động trực tiếp trên app
                  </button>
                  
                  <button
                    className="aiwizard-btn-skip manual-check-btn"
                    onClick={handleSaveLocal}
                  >
                    <IconRefresh size={16} /> Tôi đã tự chạy 'ollama pull' thủ công - Kiểm tra lại
                  </button>
                  
                  <button
                    className="aiwizard-btn-skip borderless-btn"
                    onClick={() => setLocalStatus("idle")}
                  >
                    Quay lại chọn phiên bản nhẹ/mạnh hơn
                  </button>
                </div>
              </div>
            ) : localStatus === "pulling" ? (
              <div className="aiwizard-model-pulling-premium">
                <div className="pull-header">
                  <IconSpinner size={32} className="icon-spin text-primary" />
                  <h3>Đang tải mô hình AI cục bộ...</h3>
                </div>
                
                <p className="pull-message">{pullMessage}</p>
                
                <div className="pull-progress-container">
                  <div className="pull-progress-track">
                    <div className="pull-progress-fill" style={{ width: `${pullProgress}%` }} />
                  </div>
                  <div className="pull-progress-info">
                    <span>Tiến trình: {pullProgress}%</span>
                    <span>Vui lòng giữ ứng dụng hoạt động, không tắt máy</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="aiwizard-desc">
                  Chọn cấp độ mô hình phù hợp với khả năng xử lý của thiết bị. Cấu hình máy của bạn hoạt động mượt mà nhất với tuỳ chọn được gợi ý.
                </p>

                <div className="aiwizard-tiers-grid">
                  {["weak", "medium", "strong"].map((tier) => {
                    const labels: Record<string, string> = {
                      weak: "Phiên bản nhẹ (Nhanh, Tiết kiệm)",
                      medium: "Phiên bản chuẩn (Khuyên dùng)",
                      strong: "Phiên bản mạnh (Chính xác cao)",
                    };
                    const ramReq: Record<string, string> = {
                      weak: "RAM đề nghị: 4 - 8GB",
                      medium: "RAM đề nghị: 8 - 16GB",
                      strong: "RAM đề nghị: trên 16GB",
                    };
                    const models: Record<string, string> = {
                      weak: specs?.suggested_tier === "weak" ? specs.suggested_model : "qwen2.5:3b",
                      medium: specs?.suggested_tier === "medium" ? specs.suggested_model : "qwen2.5:7b",
                      strong: specs?.suggested_tier === "strong" ? specs.suggested_model : "qwen2.5:14b",
                    };
                    return (
                      <div
                        key={tier}
                        className={`aiwizard-tier-card-premium ${selectedTier === tier ? "active" : ""} ${specs?.suggested_tier === tier ? "recommended" : ""}`}
                        onClick={() => setSelectedTier(tier)}
                      >
                        <div className="tier-header-info">
                          <span className="tier-label">{labels[tier]}</span>
                          <span className="tier-model-name">{models[tier]}</span>
                          <span className="tier-ram-req">{ramReq[tier]}</span>
                        </div>
                        <div className="tier-check-circle">
                          {selectedTier === tier && <IconCheck size={14} />}
                        </div>
                        {specs?.suggested_tier === tier && (
                          <span className="tier-badge-recommended">Gợi ý từ cấu hình máy</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}

                <div className="aiwizard-actions-row">
                  <button className="aiwizard-btn-primary" onClick={handleSaveLocal} disabled={saving}>
                    {saving ? <IconSpinner size={18} className="icon-spin" /> : <IconCheck size={18} />}
                    <span>{saving ? "Đang cấu hình..." : "Xác nhận & Tải AI"}</span>
                  </button>
                  <button className="aiwizard-btn-skip" onClick={() => setStep("mode")} disabled={saving}>
                    Quay lại
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Storage Step */}
        {step === "storage" && (
          <div className="aiwizard-step storage-step">
            <div className="aiwizard-logo logo-pulse">
              <IconFolder size={48} className="icon-gradient" />
            </div>
            <h2 className="aiwizard-title">📁 Chọn thư mục lưu trữ</h2>
            
            <div className="aiwizard-info-summary-premium">
              <div className="info-summary-header">
                <IconCheck size={16} />
                <span>Chế độ AI đã chọn: {
                  chosenMode === "cloud_free" ? "Cloud Free (Gemini API)" :
                  chosenMode === "cloud_custom" ? `Custom Key (${customProvider === "deepseek" ? "DeepSeek" : customProvider === "gemini" ? "Gemini" : "Claude"})` :
                  "Offline Cục Bộ (AI Offline)"
                }</span>
              </div>
              <p className="info-summary-desc">
                {chosenMode === "local" 
                  ? "Tài liệu nghiên cứu, tệp chỉ mục và các mô hình AI cục bộ sẽ được lưu trữ cục bộ. Hãy đảm bảo ổ đĩa trống từ 10GB trở lên."
                  : "Mặc dù phân tích bằng AI đám mây, toàn bộ tệp PDF nghiên cứu và cơ sở dữ liệu tri thức của bạn vẫn được lưu trữ bảo mật 100% trên máy của bạn."
                }
              </p>
            </div>

            <div className="storage-path-selector-box">
              <label className="storage-path-label">Đường dẫn lưu trữ dữ liệu:</label>
              <div className="storage-path-input-group">
                <input
                  type="text"
                  className="storage-path-input-read"
                  value={storagePath}
                  readOnly
                  placeholder="Nhấp thay đổi để chọn thư mục lưu trữ..."
                  onClick={handleSelectStorageDir}
                />
                <button
                  type="button"
                  className="storage-path-browse-btn"
                  onClick={handleSelectStorageDir}
                  disabled={saving}
                >
                  Thay đổi...
                </button>
              </div>

              {diskSpace && (
                <div className={`disk-space-card ${diskSpace.warning ? "warning" : "safe"}`}>
                  <div className="disk-space-header">
                    <span>Dung lượng ổ đĩa khả dụng:</span>
                    <strong className="disk-space-val">{diskSpace.free_gb} GB tự do</strong>
                  </div>
                  
                  {/* Disk gauge */}
                  <div className="disk-gauge-track">
                    <div 
                      className="disk-gauge-fill" 
                      style={{ 
                        width: `${Math.min(100, Math.max(15, (diskSpace.free_gb / 200) * 100))}%` 
                      }} 
                    />
                  </div>
                  
                  {diskSpace.warning && (
                    <div className="disk-space-warning-row">
                      <IconError size={14} />
                      <span>Không gian đĩa trống còn lại khá thấp. Để tránh lỗi tải tài liệu, hãy cân nhắc chọn một ổ đĩa trống lớn hơn (như D:\ hoặc E:\).</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}

            <div className="aiwizard-actions-row" style={{ marginTop: 16 }}>
              <button className="aiwizard-btn-primary" onClick={handleSaveStorage} disabled={saving}>
                {saving ? <IconSpinner size={18} className="icon-spin" /> : <IconCheck size={18} />}
                <span>{saving ? "Đang thiết lập lưu trữ..." : "Hoàn tất & Tiếp tục"}</span>
              </button>
              <button 
                className="aiwizard-btn-skip" 
                onClick={() => setStep(chosenMode === "cloud_custom" ? "cloud_custom" : "mode")} 
                disabled={saving}
              >
                Quay lại
              </button>
            </div>
          </div>
        )}

        {/* Done Step */}
        {step === "done" && (
          <div className="aiwizard-step done-step">
            {/* Cyber Activation Core animation */}
            <div className="cyber-activation-core">
              <div className="core-orbit orbit-outer" />
              <div className="core-orbit orbit-middle" />
              <div className="core-orbit orbit-inner" />
              <div className="core-brain-center">
                <IconSparkle size={32} className="activation-sparkle" />
              </div>
            </div>
            
            <h2 className="aiwizard-title font-gradient-green">Hệ thống đã sẵn sàng!</h2>
            <p className="aiwizard-desc">
              ResearchMind VN đã được cấu hình thành công và sẵn sàng đồng hành cùng các công trình nghiên cứu của bạn.
            </p>

            <div className="done-quick-start-dashboard">
              <h4 className="dashboard-title">🚀 HƯỚNG DẪN TRẢI NGHIỆM NHANH:</h4>
              <div className="quick-start-grid">
                <div className="quick-start-card">
                  <div className="card-icon"><IconFolder size={20} /></div>
                  <div className="card-text">
                    <h5>Lập thư viện PDF</h5>
                    <p>Kéo thả các bài báo khoa học (.pdf) vào tab <strong>Thư viện</strong> để AI tự phân tích cấu trúc.</p>
                  </div>
                </div>

                <div className="quick-start-card">
                  <div className="card-icon"><IconSearch size={20} /></div>
                  <div className="card-text">
                    <h5>Tìm kiếm thông minh</h5>
                    <p>Sử dụng tab <strong>Tìm kiếm</strong> để truy tìm kết quả theo nghĩa học thuật thay vì từ khóa thô.</p>
                  </div>
                </div>

                <div className="quick-start-card">
                  <div className="card-icon"><IconSparkle size={20} /></div>
                  <div className="card-text">
                    <h5>Phân tích tài liệu AI</h5>
                    <p>Khám phá nhanh đóng góp cốt lõi (Core claims), phương pháp đột phá của từng paper trong tích tắc.</p>
                  </div>
                </div>

                <div className="quick-start-card">
                  <div className="card-icon"><IconSettings size={20} /></div>
                  <div className="card-text">
                    <h5>Cài đặt linh hoạt</h5>
                    <p>Thay đổi API Key, chuyển sang offline cục bộ hoặc cấu hình thư mục lưu trữ bất cứ lúc nào.</p>
                  </div>
                </div>
              </div>
            </div>

            <button className="aiwizard-btn-primary animate-pulse-glow launch-btn" onClick={onComplete}>
              <span>Khởi chạy ResearchMind VN</span>
              <IconSparkle size={18} />
            </button>
          </div>
        )}

        {/* Dynamic Step Tracker */}
        <div className="aiwizard-progress-tracker">
          {[
            { label: "Giới thiệu", key: "welcome" },
            { label: "Chọn AI", key: "mode" },
            { label: "Cấu hình", key: "config" },
            { label: "Lưu trữ", key: "storage" },
            { label: "Hoàn tất", key: "done" }
          ].map((item, idx) => {
            const stepOrder = ["welcome", "mode", "config", "storage", "done"];
            let currentIdx = stepOrder.indexOf(step);
            if (step === "cloud_custom" || step === "local") {
              currentIdx = stepOrder.indexOf("config");
            }
            
            const isCompleted = currentIdx > idx;
            const isActive = currentIdx === idx;
            
            return (
              <div key={item.key} className={`tracker-step ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}`}>
                <div className="tracker-node">
                  {isCompleted ? <IconCheck size={12} /> : <span>{idx + 1}</span>}
                </div>
                <span className="tracker-label">{item.label}</span>
                {idx < 4 && <div className="tracker-line" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
