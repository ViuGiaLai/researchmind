import { env } from "./env";
import { TOKEN_KEY } from "@/utils/constants";
import { logger } from "./logger";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // Prefer Clerk/Firebase session token; fall back to shared gateway token (Desktop parity)
  const sessionToken = localStorage.getItem(TOKEN_KEY);
  const token = sessionToken || env.gatewaySharedToken || "";
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body) return fallback;
  if (typeof body === "string") return body;
  if (typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.detail === "string") return o.detail;
    if (typeof o.error === "string") return o.error;
    if (typeof o.message === "string") return o.message;
  }
  return fallback;
}

/** Call Cloud Pages report API (`functions/api/v1`) — shared by Desktop + Web. */
export async function cloudFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${env.cloudApiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const sessionToken = localStorage.getItem(TOKEN_KEY);
  const initialToken = sessionToken || env.gatewaySharedToken || undefined;

  const doFetch = async (token?: string): Promise<T> => {
    const headers = new Headers(init.headers || {});
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(url, { ...init, headers });
    const body = await parseBody(res);
    if (!res.ok) {
      const message = errorMessage(body, `Cloud API error ${res.status}`);
      if (res.status !== 405 && res.status !== 401) {
        logger.error("cloudFetch failed", { url, status: res.status, body });
      }
      throw new ApiError(res.status, message, body);
    }
    return body as T;
  };

  try {
    return await doFetch(initialToken);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && sessionToken && env.gatewaySharedToken) {
      localStorage.removeItem(TOKEN_KEY);
      return doFetch(env.gatewaySharedToken);
    }
    throw err;
  }
}

/** @deprecated Prefer cloudFetch — kept for rare local tooling. */
export async function backendFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return cloudFetch<T>(path, init);
}
