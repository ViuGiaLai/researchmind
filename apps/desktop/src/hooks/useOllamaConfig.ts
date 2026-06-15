import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface OllamaConfig {
  url: string;
  model: string;
}

export type HealthStatus = "unknown" | "checking" | "connected" | "disconnected";

/** Hook to manage Ollama configuration and health checks. */
export function useOllamaConfig() {
  const [config, setConfig] = useState<OllamaConfig>({
    url: "http://localhost:11434",
    model: "qwen2.5:7b",
  });
  const [health, setHealth] = useState<HealthStatus>("unknown");
  const [saving, setSaving] = useState(false);

  /** Load current config from backend. */
  const loadConfig = useCallback(async () => {
    try {
      const result = await invoke<OllamaConfig>("get_ollama_config");
      setConfig(result);
    } catch (e) {
      console.error("Failed to load Ollama config:", e);
    }
  }, []);

  /** Run health check — optionally pass draft URL/model from the UI form. */
  const checkHealth = useCallback(
    async (draftUrl?: string, draftModel?: string) => {
      setHealth("checking");
      try {
        const result = await invoke<{
          running: boolean;
          url: string;
          model: string;
        }>("check_ollama_health", {
          url: draftUrl || null,
          model: draftModel || null,
        });
        setHealth(result.running ? "connected" : "disconnected");
        setConfig({ url: result.url, model: result.model });
      } catch (e) {
        console.error("Health check failed:", e);
        setHealth("disconnected");
      }
    },
    []
  );

  /** Save new config and recreate ChatManager. */
  const saveConfig = useCallback(
    async (url: string, model: string) => {
      setSaving(true);
      try {
        await invoke("update_ollama_config", { url, model });
        setConfig({ url, model });
      } catch (e) {
        console.error("Failed to update Ollama config:", e);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  /** Get a descriptive label for health status. */
  const healthLabel =
    health === "unknown"
      ? "Chưa kiểm tra"
      : health === "checking"
      ? "Đang kiểm tra..."
      : health === "connected"
      ? "✅ Kết nối thành công"
      : "❌ Không kết nối được";

  return {
    config,
    health,
    healthLabel,
    saving,
    loadConfig,
    checkHealth,
    saveConfig,
  };
}
