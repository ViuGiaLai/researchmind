/**
 * ResearchMind Pluggable Auth — Unified Provider
 *
 * - Quick Login (Dev) → Mock user (localStorage, bypasses Clerk)
 * - Email/Password / Google → Clerk (real auth)
 * - Không có Clerk key → MockOnly (toàn bộ đều là Mock)
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  ClerkProvider,
  useUser as useClerkUser,
  useAuth as useClerkAuth,
  useSignIn as useClerkSignIn,
  useSignUp as useClerkSignUp,
} from "@clerk/clerk-react";
import { setCurrentToken } from "./auth-token";

// ─── Types ─────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  uid?: string;
  email?: string;
  name?: string;
  displayName?: string;
  imageUrl?: string;
  photoURL?: string;
  providerData?: Array<{ providerId: string }>;
}

export interface AuthContextType {
  enabled: boolean;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  getToken: () => Promise<string | null>;
  signIn: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// ─── Helpers ───────────────────────────────────────────────────

const MOCK_STORAGE_KEYS = {
  id: "rm_auth_id",
  name: "rm_auth_name",
  email: "rm_auth_email",
} as const;

function mockStorageUser(): AuthUser | null {
  const id = localStorage.getItem(MOCK_STORAGE_KEYS.id);
  if (!id) return null;
  return {
    id,
    uid: id,
    name: localStorage.getItem(MOCK_STORAGE_KEYS.name) || "Researcher",
    displayName: localStorage.getItem(MOCK_STORAGE_KEYS.name) || "Researcher",
    email: localStorage.getItem(MOCK_STORAGE_KEYS.email) || "",
    providerData: [{ providerId: "mock" }],
  };
}

function saveMockUser(name: string, email = "") {
  const id = "user_" + Math.random().toString(36).substring(7);
  localStorage.setItem(MOCK_STORAGE_KEYS.id, id);
  localStorage.setItem(MOCK_STORAGE_KEYS.name, name);
  localStorage.setItem(MOCK_STORAGE_KEYS.email, email);
  return id;
}

function clearMockUser() {
  Object.values(MOCK_STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
}

function mapClerkUser(cu: any): AuthUser {
  return {
    id: cu.id,
    uid: cu.id,
    email: cu.primaryEmailAddress?.emailAddress || "",
    name: cu.fullName || cu.firstName || cu.username || cu.id,
    displayName: cu.fullName || cu.firstName || cu.username || "",
    imageUrl: cu.imageUrl,
    photoURL: cu.imageUrl,
    providerData: [{ providerId: "clerk" }],
  };
}

function clerkError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as any;
    if (e.errors?.[0]?.longMessage) return e.errors[0].longMessage;
    if (e.errors?.[0]?.message) return e.errors[0].message;
    if (e.message) return e.message;
  }
  return "An unknown error occurred";
}

// ─── Configuration ─────────────────────────────────────────────

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";
const clerkConfigured = Boolean(clerkPublishableKey);

// ====================================================================
//  COMBINED PROVIDER (Clerk + Mock) — dùng khi có Clerk key
//  Quick Login → Mock (localStorage), Email/Password → Clerk (API)
// ====================================================================

function CombinedAuthProvider({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded, isSignedIn } = useClerkUser();
  const { getToken: clerkGetToken, signOut: clerkSignOut } = useClerkAuth();
  const { signIn: clerkSignIn, setActive } = useClerkSignIn();
  const { signUp: clerkSignUp, setActive: setSignUpActive } = useClerkSignUp();
  const [error, setError] = useState<string | null>(null);

  // Mock user state (từ localStorage, dùng cho Quick Login)
  const [mockUser, setMockUser] = useState<AuthUser | null>(() => mockStorageUser());

  // Sync token
  useEffect(() => {
    if (mockUser) {
      setCurrentToken(mockUser.id);
    } else if (isSignedIn) {
      clerkGetToken().then((t) => setCurrentToken(t || null));
    } else {
      setCurrentToken(null);
    }
  }, [mockUser, isSignedIn, clerkGetToken]);

  // Active user: Mock ưu tiên (Quick Login override Clerk)
  const activeUser: AuthUser | null =
    mockUser ?? (isSignedIn && clerkUser ? mapClerkUser(clerkUser) : null);

  const loading = mockUser ? false : !isLoaded;
  const enabled = true;

  // ── Quick Login: tạo mock user, bypass Clerk ──
  const signIn = useCallback(() => {
    clearMockUser(); // Xóa cũ nếu có
    saveMockUser("Quick User");
    setMockUser(mockStorageUser());
    setError(null);
  }, []);

  // ── signInWithEmail: dùng Clerk (xóa mock user trước) ──
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      clearMockUser();
      setMockUser(null);
      const result = await clerkSignIn.create({ identifier: email.trim(), password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      } else if (result.status === "needs_second_factor") {
        setError("Two-factor authentication is required.");
        throw new Error("2FA required");
      } else {
        setError("Sign in failed");
        throw new Error("Incomplete sign-in: " + result.status);
      }
    } catch (err: unknown) {
      const msg = clerkError(err);
      if (!msg.includes("2FA")) setError(msg);
      throw new Error(msg);
    }
  }, [clerkSignIn, setActive]);

  // ── signInWithGoogle: Clerk OAuth ──
  const signInWithGoogle = useCallback(async () => {
    try {
      setError(null);
      clearMockUser();
      setMockUser(null);
      const redirectUrl = window.location.origin + "/sign-up";
      await clerkSignIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl,
        redirectUrlComplete: redirectUrl,
      });
    } catch (err: unknown) {
      const msg = clerkError(err);
      setError(msg);
      throw new Error(msg);
    }
  }, [clerkSignIn]);

  // ── registerWithEmail: Clerk sign-up ──
  const registerWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      clearMockUser();
      setMockUser(null);
      const result = await clerkSignUp.create({ emailAddress: email.trim(), password });
      if (result.status === "complete") {
        await setSignUpActive({ session: result.createdSessionId });
      } else if (result.status === "missing_requirements") {
        window.location.href = "/sign-up?email=" + encodeURIComponent(email.trim());
      } else {
        setError("Registration failed");
        throw new Error("Incomplete sign-up: " + result.status);
      }
    } catch (err: unknown) {
      const msg = clerkError(err);
      setError(msg);
      throw new Error(msg);
    }
  }, [clerkSignUp, setSignUpActive]);

  // ── resetPassword: Clerk gửi email ──
  const resetPassword = useCallback(async (email: string) => {
    try {
      setError(null);
      const result = await clerkSignIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      if (result.status === "needs_first_factor") {
        setError("Password reset email sent. Please check your inbox.");
      }
    } catch (err: unknown) {
      const msg = clerkError(err);
      setError(msg);
      throw new Error(msg);
    }
  }, [clerkSignIn]);

  // ── updateDisplayName: Clerk ──
  const updateDisplayName = useCallback(async (displayName: string) => {
    if (mockUser) {
      localStorage.setItem(MOCK_STORAGE_KEYS.name, displayName);
      setMockUser((prev) => prev ? { ...prev, name: displayName, displayName } : prev);
      return;
    }
    if (!clerkUser) throw new Error("No authenticated user");
    try {
      const parts = displayName.trim().split(/\s+/);
      await clerkUser.update({ firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || undefined });
    } catch (err: unknown) { throw new Error(clerkError(err)); }
  }, [mockUser, clerkUser]);

  // ── signOut: clear cả Mock + Clerk ──
  const signOut = useCallback(() => {
    clearMockUser();
    setMockUser(null);
    setError(null);
    clerkSignOut();
    setCurrentToken(null);
  }, [clerkSignOut]);

  // ── getToken ──
  const getToken = useCallback(async (): Promise<string | null> => {
    if (mockUser) return mockUser.id;
    try { return await clerkGetToken(); } catch { return null; }
  }, [mockUser, clerkGetToken]);

  return (
    <AuthContext.Provider
      value={{
        user: activeUser, loading, enabled, error,
        getToken, signIn, signInWithGoogle, signInWithEmail,
        registerWithEmail, resetPassword, updateDisplayName, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ====================================================================
//  MOCK-ONLY PROVIDER (khi không có Clerk key)
// ====================================================================

function MockOnlyAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => mockStorageUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setLoading(false); }, [user]);

  useEffect(() => {
    setCurrentToken(user?.id || null);
  }, [user]);

  const signIn = useCallback(() => {
    saveMockUser("Quick User");
    setUser(mockStorageUser());
    setError(null);
  }, []);

  const signInWithGoogle = useCallback(async () => { signIn(); }, [signIn]);

  const signInWithEmail = useCallback(async (email: string, _password: string) => {
    saveMockUser(email.split("@")[0], email);
    setUser(mockStorageUser());
    setError(null);
  }, []);

  const registerWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmail(email, password);
  }, [signInWithEmail]);

  const resetPassword = useCallback(async (_email: string) => {
    setError("Password reset not available in mock mode.");
  }, []);

  const updateDisplayName = useCallback(async (displayName: string) => {
    if (!user) throw new Error("No authenticated user");
    localStorage.setItem(MOCK_STORAGE_KEYS.name, displayName);
    setUser((prev) => prev ? { ...prev, name: displayName, displayName } : prev);
  }, [user]);

  const signOut = useCallback(() => {
    clearMockUser();
    setUser(null);
    setError(null);
    setCurrentToken(null);
  }, []);

  const getToken = useCallback(async () => localStorage.getItem(MOCK_STORAGE_KEYS.id), []);

  return (
    <AuthContext.Provider
      value={{
        user, loading, enabled: true, error,
        getToken, signIn, signInWithGoogle, signInWithEmail,
        registerWithEmail, resetPassword, updateDisplayName, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ====================================================================
//  PLUGGABLE AUTH PROVIDER
// ====================================================================

export function PluggableAuthProvider({ children }: { children: React.ReactNode }) {
  if (clerkConfigured) {
    return (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <CombinedAuthProvider>
          {children}
        </CombinedAuthProvider>
      </ClerkProvider>
    );
  }

  return <MockOnlyAuthProvider>{children}</MockOnlyAuthProvider>;
}
