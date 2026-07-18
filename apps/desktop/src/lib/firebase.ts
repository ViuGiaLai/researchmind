import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth";
import { open } from "@tauri-apps/plugin-shell";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import i18n from "../i18n";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8765";
const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
);

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let currentIdToken = "";
let fetchInstalled = false;

function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && (
    "__TAURI_INTERNALS__" in window || "__TAURI__" in window
  );
}

function secureRandomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

async function refocusDesktopWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFocus();
  } catch {
    // Focusing is a desktop enhancement; authentication has already completed.
  }
}

async function signInWithDesktopGoogle(auth: Auth): Promise<void> {
  const state = secureRandomToken();
  const verifier = secureRandomToken();
  const startResponse = await fetch(`${backendUrl}/api/auth/desktop/google/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, verifier }),
  });
  if (!startResponse.ok) throw new Error(await startResponse.text());
  const { authorizationUrl } = await startResponse.json() as { authorizationUrl?: string };
  if (!authorizationUrl) throw new Error("Desktop OAuth did not return an authorization URL.");

  await open(authorizationUrl);
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    await wait(1_000);
    const statusResponse = await fetch(`${backendUrl}/api/auth/desktop/google/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, verifier }),
    });
    if (!statusResponse.ok) throw new Error(await statusResponse.text());
    const status = await statusResponse.json() as { status: string; idToken?: string; message?: string };
    if (status.status === "pending") continue;
    if (status.status === "error") throw new Error(status.message || "Google sign-in was not completed.");
    if (status.status === "complete" && status.idToken) {
      await signInWithCredential(auth, GoogleAuthProvider.credential(status.idToken));
      await refocusDesktopWindow();
      return;
    }
    throw new Error("Desktop OAuth returned an invalid response.");
  }
  throw new Error("Google sign-in timed out. Please try again.");
}

function getAuthClient(): Auth {
  if (!firebaseConfigured) throw new Error("Firebase is not configured for this build.");
  if (!firebaseAuth) {
    firebaseApp = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
  }
  return firebaseAuth;
}

function isBackendRequest(input: RequestInfo | URL): boolean {
  try {
    const requestUrl = input instanceof Request ? input.url : String(input);
    return new URL(requestUrl, window.location.href).origin === new URL(backendUrl).origin;
  } catch {
    return false;
  }
}

function installAuthenticatedFetch(): void {
  if (fetchInstalled || !firebaseConfigured) return;
  fetchInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!currentIdToken || !isBackendRequest(request)) return nativeFetch(request);
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${currentIdToken}`);
    return nativeFetch(new Request(request, { headers }));
  };
}

export function getFirebaseIdToken(): string {
  return currentIdToken;
}

type FirebaseAuthContextValue = {
  enabled: boolean;
  loading: boolean;
  user: User | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

function readableAuthError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": i18n.t("auth.error_invalid_credential"),
    "auth/email-already-in-use": i18n.t("auth.error_email_in_use"),
    "auth/weak-password": i18n.t("auth.error_weak_password"),
    "auth/invalid-email": i18n.t("auth.error_invalid_email"),
    "auth/popup-closed-by-user": i18n.t("auth.error_popup_closed"),
    "auth/popup-blocked": i18n.t("auth.error_popup_blocked"),
    "auth/unauthorized-domain": i18n.t("auth.error_unauthorized_domain"),
    "auth/operation-not-allowed": i18n.t("auth.error_provider_disabled"),
    "auth/auth-domain-config-required": i18n.t("auth.error_auth_domain"),
    "auth/invalid-api-key": i18n.t("auth.error_api_key"),
    "auth/app-not-authorized": i18n.t("auth.error_app_unauthorized"),
    "auth/network-request-failed": i18n.t("auth.error_network"),
    "auth/web-storage-unsupported": i18n.t("auth.error_storage"),
    "auth/operation-not-supported-in-this-environment": i18n.t("auth.error_environment"),
    "auth/account-exists-with-different-credential": i18n.t("auth.error_account_provider"),
  };
  return messages[code] || i18n.t("auth.error_generic", { code: code ? ` (${code})` : "" });
}

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    installAuthenticatedFetch();
    return onIdTokenChanged(getAuthClient(), async (nextUser) => {
      try {
        currentIdToken = nextUser ? await nextUser.getIdToken() : "";
        setUser(nextUser);
        setError(null);
      } catch {
        currentIdToken = "";
        setError(i18n.t("auth.error_secure_session"));
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const value = useMemo<FirebaseAuthContextValue>(() => ({
    enabled: firebaseConfigured,
    loading,
    user,
    error,
    signInWithGoogle: async () => {
      setError(null);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      if (isTauriDesktop()) {
        await signInWithDesktopGoogle(getAuthClient()).catch((err) => {
          if (import.meta.env.DEV) console.warn("Firebase desktop Google sign-in failed", err);
          const message = readableAuthError(err);
          setError(message);
          throw new Error(message);
        });
        return;
      }
      await signInWithPopup(getAuthClient(), provider).catch((err) => {
        if (import.meta.env.DEV) console.warn("Firebase Google sign-in failed", err);
        const message = readableAuthError(err);
        setError(message);
        throw new Error(message);
      });
    },
    signInWithEmail: async (email, password) => {
      setError(null);
      await signInWithEmailAndPassword(getAuthClient(), email.trim(), password).catch((err) => {
        if (import.meta.env.DEV) console.warn("Firebase email sign-in failed", err);
        const message = readableAuthError(err);
        setError(message);
        throw new Error(message);
      });
    },
    registerWithEmail: async (email, password) => {
      setError(null);
      await createUserWithEmailAndPassword(getAuthClient(), email.trim(), password).catch((err) => {
        if (import.meta.env.DEV) console.warn("Firebase registration failed", err);
        const message = readableAuthError(err);
        setError(message);
        throw new Error(message);
      });
    },
    resetPassword: async (email) => {
      setError(null);
      await sendPasswordResetEmail(getAuthClient(), email.trim()).catch((err) => {
        if (import.meta.env.DEV) console.warn("Firebase password reset failed", err);
        const message = readableAuthError(err);
        setError(message);
        throw new Error(message);
      });
    },
    updateDisplayName: async (displayName) => {
      const currentUser = getAuthClient().currentUser;
      if (!currentUser) throw new Error("No authenticated user.");
      await updateProfile(currentUser, { displayName: displayName.trim() });
      await currentUser.reload();
      setUser(getAuthClient().currentUser);
    },
    signOut: async () => firebaseSignOut(getAuthClient()),
  }), [error, loading, user]);

  return React.createElement(FirebaseAuthContext.Provider, { value }, children);
}

export function useFirebaseAuth(): FirebaseAuthContextValue {
  const context = useContext(FirebaseAuthContext);
  if (!context) throw new Error("useFirebaseAuth must be used within FirebaseAuthProvider.");
  return context;
}
