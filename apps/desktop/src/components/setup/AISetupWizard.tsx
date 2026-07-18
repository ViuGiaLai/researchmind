import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
    if (!storagePath) { setSaveMsg(t("setup.select_storage_error")); return; }
    setSaving(true);
    setSaveMsg(t("setup.saving_storage"));
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
      setSaveMsg(t("settings.save_error", { error: e instanceof Error ? e.message : t("error.unknown") }));
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
      setSaveMsg(t("setup.need_api_key", { provider: customProvider }));
      return;
    }
    setSaving(true);
    setSaveMsg(t("setup.checking_custom"));
    try {
      const val = await api.validateApiKey(customProvider, activeKey);
      if (!val.valid) {      setSaveMsg(t("setup.invalid_api_key", { error: val.error })); setSaving(false); return; }
      await api.updateSettings({
        llm_mode: "cloud_custom", custom_cloud_provider: customProvider,
        deepseek_api_key: deepseekApiKey, gemini_api_key: geminiApiKey, claude_api_key: claudeApiKey,
      });
      setChosenMode("cloud_custom");
      setStep("storage");
      setSaveMsg(null);
    } catch (e) {
      setSaveMsg(t("settings.save_error", { error: e instanceof Error ? e.message : t("error.unknown") }));
    } finally { setSaving(false); }
  };

  const handleSaveLocal = async () => {
    setSaving(true);
    setSaveMsg(t("setup.checking_llama"));
    try {
      const status = await api.getLocalStatus();
      setLocalConnected(status.connected);
      if (status.connected) {
        await api.updateSettings({ llm_mode: "local", llama_server_url: llamaServerUrl, local_model: localModel, setup_completed: true });
        setStep("done");
      } else {
        setSaveMsg(t("setup.cannot_connect_llama", { url: llamaServerUrl }));
      }
    } catch (e) {
      setSaveMsg(t("settings.save_error", { error: e instanceof Error ? e.message : t("error.unknown") }));
    } finally { setSaving(false); }
  };

  return (
    <div className="aiwizard-overlay">
      <div className="aiwizard-card">
        {step === "welcome" && (
          <div className="aiwizard-step welcome-step">
            <div className="aiwizard-logo"><IconBrain size={48} className="icon-gradient" /></div>
            <h1 className="aiwizard-title">{t("setup.welcome_title")}</h1>
            <p className="aiwizard-desc">{t("setup.welcome_desc")}</p>
            {specsLoading ? <IconSpinner size={24} className="icon-spin" /> : (
              <div className="aiwizard-scan-hud">
                <div className="scan-hud-grid">
                  <div className="scan-hud-item scanned"><IconCpu size={20} /><span>{t("setup.cores_count", { count: specs?.cpu_cores })}</span></div>
                  <div className="scan-hud-item scanned"><IconMonitor size={20} /><span>{t("setup.ram_gb", { gb: specs?.total_ram_gb })}</span></div>
                </div>
                <button className="aiwizard-btn-primary" onClick={() => setStep("mode")}>{t("setup.start_setup")} →</button>
              </div>
            )}
          </div>
        )}

        {step === "mode" && (
          <div className="aiwizard-step mode-step">
            <h2 className="aiwizard-title">{t("setup.choose_ai_mode")}</h2>
            <div className="aiwizard-mode-cards-grid">
              <button type="button" className={`aiwizard-mode-card-premium ${chosenMode === "cloud_free" ? "active" : ""}`} aria-pressed={chosenMode === "cloud_free"} onClick={() => setChosenMode("cloud_free")}>
                <IconZap size={28} /><h3>{t("setup.cloud_free_title")}</h3><p>{t("setup.cloud_free_desc")}</p>
              </button>
              <button type="button" className={`aiwizard-mode-card-premium ${chosenMode === "cloud_custom" ? "active" : ""}`} aria-pressed={chosenMode === "cloud_custom"} onClick={() => setChosenMode("cloud_custom")}>
                <IconKey size={28} /><h3>{t("setup.custom_key_title")}</h3><p>{t("setup.custom_key_desc")}</p>
              </button>
              <button type="button" className={`aiwizard-mode-card-premium ${chosenMode === "local" ? "active" : ""}`} aria-pressed={chosenMode === "local"} onClick={() => setChosenMode("local")}>
                <IconLock size={28} /><h3>{t("setup.local_title")}</h3><p>{t("setup.local_desc")}</p>
              </button>
            </div>
            <button className="aiwizard-btn-primary" onClick={handleNextFromMode} disabled={!chosenMode}>{t("common.continue")} →</button>
          </div>
        )}

        {step === "cloud_custom" && (
          <div className="aiwizard-step">
            <h2 className="aiwizard-title">{t("setup.configure_api_key")}</h2>
            <div className="provider-tabs">
              {["deepseek", "gemini", "claude"].map(p => (
                <button key={p} className={`provider-tab-btn-premium ${customProvider === p ? "active" : ""}`} onClick={() => { setCustomProvider(p as any); setSaveMsg(null); }}>{p}</button>
              ))}
            </div>
            <div className="aiwizard-field-premium">
                  <input type="password" className="aiwizard-input-premium" value={customProvider === "deepseek" ? deepseekApiKey : customProvider === "gemini" ? geminiApiKey : claudeApiKey} onChange={e => { const v = e.target.value; if (customProvider === "deepseek") setDeepseekApiKey(v); else if (customProvider === "gemini") setGeminiApiKey(v); else setClaudeApiKey(v); }} placeholder={t("setup.api_key_placeholder")} />
            </div>
            {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}
            <button className="aiwizard-btn-primary" onClick={handleSaveCustom} disabled={saving}>{saving ? <IconSpinner size={18} className="icon-spin" /> : <IconCheck size={18} />} {t("common.save")}</button>
          </div>
        )}

        {step === "local" && (
          <div className="aiwizard-step local-setup-step">
            <h2 className="aiwizard-title">{t("setup.configure_llama")}</h2>
            <div className="aiwizard-field-premium">
              <label>{t("setup.llama_server_url")}</label>
              <input className="aiwizard-input-premium" value={llamaServerUrl} onChange={e => setLlamaServerUrl(e.target.value)} />
            </div>
            <div className="aiwizard-field-premium">
              <label>{t("setup.model_name")}</label>
              <input className="aiwizard-input-premium" value={localModel} onChange={e => setLocalModel(e.target.value)} />
            </div>
            {localConnected === false && <LocalErrorBanner title={t("error.llama_connect")} message={t("setup.llama_server_hint", { url: llamaServerUrl })} />}
            {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}
            <button className="aiwizard-btn-primary" onClick={handleSaveLocal} disabled={saving}>{saving ? <IconSpinner size={18} className="icon-spin" /> : <IconCheck size={18} />} {t("setup.connect_finish")}</button>
          </div>
        )}

        {step === "storage" && (
          <div className="aiwizard-step storage-step">
            <h2 className="aiwizard-title">{t("setup.choose_storage")}</h2>
            <div className="storage-path-selector-box">
              <input type="text" className="storage-path-input-read" value={storagePath} readOnly onClick={handleSelectStorageDir} />
              <button onClick={handleSelectStorageDir} disabled={saving}>{t("common.edit")}</button>
            </div>
            {diskSpace && <p>{t("setup.disk_free", { gb: diskSpace.free_gb })}</p>}
            {saveMsg && <p className="aiwizard-error-message"><IconError size={16} /> {saveMsg}</p>}
            <button className="aiwizard-btn-primary" onClick={handleSaveStorage} disabled={saving}>{saving ? <IconSpinner size={18} className="icon-spin" /> : <IconCheck size={18} />} {t("setup.finish")}</button>
          </div>
        )}

        {step === "done" && (
          <div className="aiwizard-step done-step">
            <IconSparkle size={40} className="icon-gradient" />
            <h2 className="aiwizard-title">{t("setup.ready")}</h2>
            <button className="aiwizard-btn-primary" onClick={onComplete}>{t("setup.launch")}</button>
          </div>
        )}
      </div>
    </div>
  );
};
