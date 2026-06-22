import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  IconBrain,
  IconSpinner,
  IconCheck,
  IconZap,
  IconKey,
  IconLock,
  IconMonitor,
  IconCpu,
  IconError,
  IconSparkle,
} from "../Icons";
import { LocalErrorBanner } from "../shared/LocalErrorBanner";
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
  const [llamaServerUrl, setLlamaServerUrl] = useState("http://127.0.0.1:8080");
  const [localModel, setLocalModel] = useState("Qwen3-4B-Q4_K_M.gguf");
  const [localConnected, setLocalConnected] = useState<boolean | null>(null);
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [customProvider, setCustomProvider] = useState<"deepseek" | "gemini" | "claude">("deepseek");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
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
    } catch {
      setSpecs({ total_ram_gb: 8, cpu_cores: 4, suggested_tier: "medium", suggested_model: "Qwen3-4B-Q4_K_M.gguf" });
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
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
  };

  const handleSaveStorage = async () => {
    if (!storagePath) { setSaveMsg("Vui lòng chọn thư mục lưu trữ."); return; }
    setSaving(true);
    setSaveMsg("Đang thiết lập thư mục lưu trữ...");
    try {
      await api.moveStorage(storagePath);
      if (chosenMode === "local") {
        setStep("local");
        setSaveMsg(null);
      } else {
        await api.updateSettings({ setup_completed: true, llm_mode: chosenMode || "cloud_free" });
        setStep("done");
      }
    } catch (e) {
      setSaveMsg(`Lỗi: ${e instanceof Error ? e.message : "Không xác định"}`);
    } finally { setSaving(false); }
  };

  const handleNextFromMode = () => {
    if (!chosenMode) return;
    setSaveMsg(null);
    if (chosenMode === "cloud_free") setStep("storage");
    else if (chosenMode === "cloud_custom") setStep("cloud_custom");
    else if (chosenMode === "local") setStep("storage");
  };

  const handleSaveCustom = async () => {
    const activeKey = customProvider === "deepseek" ? deepseekApiKey : customProvider === "gemini" ? geminiApiKey : claudeApiKey;
    if (!activeKey.trim()) {
      setSaveMsg(`Vui lòng nhập API Key cho ${customProvider}`);
      return;
    }
    setSaving(true);
    setSaveMsg("Đang kiểm tra...");
    try {
      const val = await api.validateApiKey(customProvider, activeKey);
      if (!val.valid) { setSaveMsg(`API Key không hợp lệ: ${val.error}`); setSaving(false); return; }
      await api.updateSettings({
        llm_mode: "cloud_custom", custom_cloud_provider: customProvider,
        deepseek_api_key: deepseekApiKey, gemini_api_key: geminiApiKey, claude_api_key: claudeApiKey,
      });
      setChosenMode("cloud_custom");
      setStep("storage");
      setSaveMsg(null);
    } catch (e) {
      setSaveMsg(`Lỗi: ${e instanceof Error ? e.message : "Không thể lưu"}`);
    } finally { setSaving(false); }
  };

  const handleSaveLocal = async () => {
    setSaving(true);
    setSaveMsg("Đang kiểm tra kết nối llama-server...");
    try {
      const status = await api.getLocalStatus();
      setLocalConnected(status.connected);
      if (status.connected) {
        await api.updateSettings({ llm_mode: "local", llama_server_url: llamaServerUrl, local_model: localModel, setup_completed: true });
        setStep("done");
      } else {
        setSaveMsg(`Không thể kết nối đến llama-server tại ${llamaServerUrl}.`);
      }
    } catch (e) {
      setSaveMsg(`Lỗi: ${e instanceof Error ? e.message : "Không xác định"}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="aiwizard-overlay">
      <div className="aiwizard-card">
        {step === "welcome" && (
          <div className="aiwizard-step welcome-step">
            <div className="aiwizard-logo"><IconBrain size={48} className="icon-gradient" /></div>
            <h1 className="aiwizard-title">Chào mừng đến với ResearchMind</h1>
            <p className="aiwizard-desc">Trợ lý nghiên cứu khoa học thông minh. Tự động lập chỉ mục, tóm tắt, phản biện chuyên sâu.</p>
            {specsLoading ? <IconSpinner size={24} className="icon-spin" /> : (
              <div className="aiwizard-scan-hud">
                <div className="scan-hud-grid">
                  <div className="scan-hud-item scanned"><IconCpu size={20} /><span>{specs?.cpu_cores} Cores</span></div>
                  <div className="scan-hud-item scanned"><IconMonitor size={20} /><span>{specs?.total_ram_gb} GB RAM</span></div>
                </div>
                <button className="aiwizard-btn-primary" onClick={() => setStep("mode")}>Bắt đầu thiết lập →</button>
              </div>
            )}
          </div>
        )}

        {step === "mode" && (
          <div className="aiwizard-step mode-step">
            <h2 className="aiwizard-title">Chọn chế độ AI</h2>
            <div className="aiwizard-mode-cards-grid">
              <div className={`aiwizard-mode-card-premium ${chosenMode === "cloud_free" ? "active" : ""}`} onClick={() => setChosenMode("cloud_free")}>
                <IconZap size={28} /><h3>Cloud Free</h3><p>Gemini API miễn phí</p>
              </div>
              <div className={`aiwizard-mode-card-premium ${chosenMode === "cloud_custom" ? "active" : ""}`} onClick={() => setChosenMode("cloud_custom")}>
                <IconKey size={28} /><h3>Custom Key</h3><p>API Key cá nhân</p>
              </div>
              <div className={`aiwizard-mode-card-premium ${chosenMode === "local" ? "active" : ""}`} onClick={() => setChosenMode("local")}>
                <IconLock size={28} /><h3>Local GGUF</h3><p>llama-server + model cục bộ</p>
              </div>
            </div>
            <button className="aiwizard-btn-primary" onClick={handleNextFromMode} disabled={!chosenMode}>Tiếp tục →</button>
          </div>
        )}

        {step === "cloud_custom" && (
          <div className="aiwizard-step">
            <h2 className="aiwizard-title">Cấu hình API Key</h2>
            <div className="provider-tabs">
              {["deepseek", "gemini", "claude"].map(p => (
                <button key={p} className={`provider-tab-btn-premium ${customProvider === p ? "active" : ""}`} onClick={() => { setCustomProvider(p as any); setSaveMsg(null); }}>{p}</button>
              ))}
            </div>
            <div className="aiwizard-field-premium">
              <input type="password" className="aiwizard-input-premium" value={customProvider === "deepseek" ? deepseekApiKey : customProvider === "gemini" ? geminiApiKey : claudeApiKey} onChange={e => { const v = e.target.value; if (customProvider === "deepseek") setDeepseekApiKey(v); else if (customProvider === "gemini") setGeminiApiKey(v); else setClaudeApiKey(v); }} placeholder="API Key..." />
            </div>
            {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}
            <button className="aiwizard-btn-primary" onClick={handleSaveCustom} disabled={saving}>{saving ? <IconSpinner size={18} className="icon-spin" /> : <IconCheck size={18} />} Xác nhận</button>
          </div>
        )}

        {step === "local" && (
          <div className="aiwizard-step local-setup-step">
            <h2 className="aiwizard-title">Cấu hình llama-server</h2>
            <div className="aiwizard-field-premium">
              <label>llama-server URL:</label>
              <input className="aiwizard-input-premium" value={llamaServerUrl} onChange={e => setLlamaServerUrl(e.target.value)} />
            </div>
            <div className="aiwizard-field-premium">
              <label>Tên model (GGUF):</label>
              <input className="aiwizard-input-premium" value={localModel} onChange={e => setLocalModel(e.target.value)} />
            </div>
            {localConnected === false && <LocalErrorBanner title="Không thể kết nối đến llama-server" message={`Đảm bảo llama-server.exe đang chạy tại ${llamaServerUrl}`} />}
            {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}
            <button className="aiwizard-btn-primary" onClick={handleSaveLocal} disabled={saving}>{saving ? <IconSpinner size={18} className="icon-spin" /> : <IconCheck size={18} />} Kết nối & Hoàn tất</button>
          </div>
        )}

        {step === "storage" && (
          <div className="aiwizard-step storage-step">
            <h2 className="aiwizard-title">Chọn thư mục lưu trữ</h2>
            <div className="storage-path-selector-box">
              <input type="text" className="storage-path-input-read" value={storagePath} readOnly onClick={handleSelectStorageDir} />
              <button onClick={handleSelectStorageDir} disabled={saving}>Thay đổi</button>
            </div>
            {diskSpace && <p>{diskSpace.free_gb} GB trống</p>}
            {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}
            <button className="aiwizard-btn-primary" onClick={handleSaveStorage} disabled={saving}>{saving ? <IconSpinner size={18} className="icon-spin" /> : <IconCheck size={18} />} Hoàn tất</button>
          </div>
        )}

        {step === "done" && (
          <div className="aiwizard-step done-step">
            <IconSparkle size={40} className="icon-gradient" />
            <h2 className="aiwizard-title">Sẵn sàng!</h2>
            <button className="aiwizard-btn-primary" onClick={onComplete}>Khởi chạy ResearchMind</button>
          </div>
        )}
      </div>
    </div>
  );
};
