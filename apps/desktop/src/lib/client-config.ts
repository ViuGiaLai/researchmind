import { invoke } from "@tauri-apps/api/core";

const CACHE_KEY = "researchmind:client-config";

export interface ClientConfig {
  clerkPublishableKey: string;
  cloudSyncUrl: string;
  reportsApiUrl: string;
  featureFlags: Record<string, boolean>;
}

interface ClientConfigEnvelope {
  schemaVersion: number;
  clientConfigVersion: number;
  generatedAt: string | null;
  config: ClientConfig;
}

interface CachedClientConfig {
  etag: string;
  envelope: ClientConfigEnvelope;
}

let activeConfig: ClientConfig | null = null;

function normalizeUrl(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

function parseEnvelope(value: unknown): ClientConfigEnvelope {
  if (!value || typeof value !== "object") {
    throw new Error("Client configuration response is not an object.");
  }
  const envelope = value as Record<string, unknown>;
  const rawConfig = envelope.config;
  if (envelope.schemaVersion !== 1 || !rawConfig || typeof rawConfig !== "object") {
    throw new Error("Client configuration response has an unsupported schema.");
  }
  const config = rawConfig as Record<string, unknown>;
  const featureFlags = config.featureFlags;
  return {
    schemaVersion: 1,
    clientConfigVersion: typeof envelope.clientConfigVersion === "number" ? envelope.clientConfigVersion : 1,
    generatedAt: typeof envelope.generatedAt === "string" ? envelope.generatedAt : null,
    config: {
      clerkPublishableKey: typeof config.clerkPublishableKey === "string" ? config.clerkPublishableKey.trim() : "",
      cloudSyncUrl: normalizeUrl(config.cloudSyncUrl),
      reportsApiUrl: normalizeUrl(config.reportsApiUrl),
      featureFlags: featureFlags && typeof featureFlags === "object" && !Array.isArray(featureFlags)
        ? Object.fromEntries(Object.entries(featureFlags).filter(([, enabled]) => typeof enabled === "boolean")) as Record<string, boolean>
        : {},
    },
  };
}

function getCachedConfig(): CachedClientConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedClientConfig;
    if (typeof cached.etag !== "string") return null;
    return { etag: cached.etag, envelope: parseEnvelope(cached.envelope) };
  } catch {
    return null;
  }
}

function cacheConfig(cached: CachedClientConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // The in-memory configuration remains usable when storage is unavailable.
  }
}

async function getGatewayUrl(): Promise<string> {
  const raw = await invoke<string>("read_gateway_config");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Bundled gateway.json is not valid JSON.");
  }
  const url = normalizeUrl((value as { url?: unknown }).url);
  if (!url || !/^https:\/\//i.test(url)) {
    throw new Error("Bundled gateway.json must contain an HTTPS gateway URL.");
  }
  return url;
}

export async function loadClientConfig(): Promise<ClientConfig> {
  const cached = getCachedConfig();
  try {
    const gatewayUrl = await getGatewayUrl();
    const response = await fetch(`${gatewayUrl}/v1/client-config`, {
      headers: cached?.etag ? { "If-None-Match": cached.etag } : {},
      cache: "no-cache",
    });
    if (response.status === 304 && cached) {
      activeConfig = cached.envelope.config;
      return activeConfig;
    }
    if (!response.ok) {
      throw new Error(`Configuration Gateway returned HTTP ${response.status}.`);
    }
    const envelope = parseEnvelope(await response.json());
    const etag = response.headers.get("ETag") || "";
    cacheConfig({ etag, envelope });
    activeConfig = envelope.config;
    return activeConfig;
  } catch (error) {
    if (cached) {
      activeConfig = cached.envelope.config;
      return activeConfig;
    }
    throw error;
  }
}

export function getClientConfig(): ClientConfig {
  if (!activeConfig) throw new Error("Client configuration has not been loaded.");
  return activeConfig;
}

export function getCloudSyncUrl(): string {
  const url = getClientConfig().cloudSyncUrl;
  if (!url) throw new Error("Cloud Sync is not configured by the Configuration Gateway.");
  return url;
}

export function getReportsApiUrl(): string {
  const url = getClientConfig().reportsApiUrl;
  if (!url) throw new Error("Reports API is not configured by the Configuration Gateway.");
  return url;
}

export function getPublicPagesUrl(): string {
  try {
    return new URL(getReportsApiUrl()).origin;
  } catch {
    throw new Error("Reports API URL from the Configuration Gateway is invalid.");
  }
}