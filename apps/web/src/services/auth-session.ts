import type { User } from "@researchmind/types";
import { ApiError, cloudFetch } from "@/lib/http";
import { TOKEN_KEY, USER_KEY } from "@/utils/constants";
import { registerDevice } from "./devices";

export function mapAuthUser(raw: {
  id: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  plan?: User["plan"];
  emailVerified?: boolean;
  createdAt?: string;
}): User {
  const now = new Date().toISOString();
  return {
    id: raw.id,
    email: raw.email || "",
    name: raw.name || raw.email || "Researcher",
    avatarUrl: raw.avatarUrl || undefined,
    plan: raw.plan || "free",
    emailVerified: raw.emailVerified !== false,
    createdAt: raw.createdAt || now,
    updatedAt: now,
  };
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function persistSession(user: User, token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function ensureWebDevice() {
  try {
    let deviceId = localStorage.getItem("rm_device_id");
    if (!deviceId) {
      deviceId = `web_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      localStorage.setItem("rm_device_id", deviceId);
    }
    await registerDevice(deviceId, `Web · ${navigator.platform || "browser"}`, "web");
  } catch (err) {
    // Endpoint may not be deployed yet (405) — login still works with Clerk session.
    if (!(err instanceof ApiError && (err.status === 404 || err.status === 405))) {
      /* ignore */
    }
  }
}

/**
 * Best-effort profile sync to Cloud Platform.
 * If /me is not deployed yet (405), keep Clerk/local profile.
 */
export async function syncCloudProfile(local: User): Promise<User> {
  try {
    const remote = await cloudFetch<User>("/me", {
      method: "PUT",
      body: JSON.stringify({
        email: local.email,
        name: local.name,
        avatarUrl: local.avatarUrl,
      }),
    });
    return mapAuthUser({
      id: remote.id || local.id,
      email: remote.email || local.email,
      name: remote.name || local.name,
      avatarUrl: remote.avatarUrl || local.avatarUrl,
      plan: remote.plan,
      emailVerified: remote.emailVerified,
      createdAt: remote.createdAt,
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      return local;
    }
    try {
      const remote = await cloudFetch<User>("/me");
      return mapAuthUser({
        id: remote.id || local.id,
        email: remote.email || local.email,
        name: remote.name || local.name,
        avatarUrl: remote.avatarUrl || local.avatarUrl,
        plan: remote.plan,
        emailVerified: remote.emailVerified,
        createdAt: remote.createdAt,
      });
    } catch {
      return local;
    }
  }
}
