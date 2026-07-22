/**
 * Clerk wrapper — dynamically imported only when VITE_CLERK_PUBLISHABLE_KEY is set.
 * Tách riêng để tránh lỗi import Clerk package khi không dùng.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ClerkProvider,
  useUser as useClerkUser,
  useAuth as useClerkAuth,
  useSignIn as useClerkSignIn,
  useSignUp as useClerkSignUp,
} from "@clerk/clerk-react";
import { setCurrentToken } from "./auth-token";
import { AuthContext } from "./auth-provider";
import type { AuthUser } from "./auth-provider";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

/** Extract Clerk error message */
function clerkError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as any;
    if (e.errors?.[0]?.longMessage) return e.errors[0].longMessage;
    if (e.errors?.[0]?.message) return e.errors[0].message;
    if (e.message) return e.message;
  }
  return "An unknown error occurred";
}

function ClerkAuthInner({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded, isSignedIn } = useClerkUser();
  const { getToken: clerkGetToken, signOut: clerkSignOut } = useClerkAuth();
  const { signIn: clerkSignIn, setActive } = useClerkSignIn();
  const { signUp: clerkSignUp, setActive: setSignUpActive } = useClerkSignUp();
  const [error, setError] = useState<string | null>(null);

  const user: AuthUser | null = isSignedIn && clerkUser
    ? {
        id: clerkUser.id,
        uid: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || "",
        name: clerkUser.fullName || clerkUser.firstName || clerkUser.username || clerkUser.id,
        displayName: clerkUser.fullName || clerkUser.firstName || clerkUser.username || "",
        imageUrl: clerkUser.imageUrl,
        photoURL: clerkUser.imageUrl,
        providerData: [{ providerId: "clerk" }],
      }
    : null;

  useEffect(() => {
    if (!isSignedIn) { setCurrentToken(null); return; }
    const syncToken = async () => {
      try { setCurrentToken(await clerkGetToken() || null); } catch { /* ignore */ }
    };
    syncToken();
    const interval = setInterval(syncToken, 30 * 60 * 1000);
    return () => { clearInterval(interval); setCurrentToken(null); };
  }, [isSignedIn, clerkGetToken]);

  const signIn = useCallback(() => { window.location.href = "/sign-in"; }, []);
  const signInWithGoogle = useCallback(async () => {
    try {
      setError(null);
      if (!clerkSignIn) throw new Error("Clerk not initialized");
      const redirectUrl = window.location.origin + "/sign-up";
      await clerkSignIn.authenticateWithRedirect({ strategy: "oauth_google", redirectUrl, redirectUrlComplete: redirectUrl });
    } catch (err: unknown) { const msg = clerkError(err); setError(msg); throw new Error(msg); }
  }, [clerkSignIn]);
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      if (!clerkSignIn) throw new Error("Clerk not initialized");
      const result = await clerkSignIn.create({ identifier: email.trim(), password });
      if (result.status === "complete") await setActive({ session: result.createdSessionId });
      else if (result.status === "needs_second_factor") { setError("2FA required"); throw new Error("2FA required"); }
      else { setError("Sign in failed"); throw new Error(result.status || "Incomplete"); }
    } catch (err: unknown) { const msg = clerkError(err); if (!msg.includes("2FA")) setError(msg); throw new Error(msg); }
  }, [clerkSignIn, setActive]);
  const registerWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      if (!clerkSignUp) throw new Error("Clerk not initialized");
      const result = await clerkSignUp.create({ emailAddress: email.trim(), password });
      if (result.status === "complete") await setSignUpActive({ session: result.createdSessionId });
      else if (result.status === "missing_requirements") window.location.href = "/sign-up?email=" + encodeURIComponent(email.trim());
      else { setError("Registration failed"); throw new Error(result.status || "Incomplete"); }
    } catch (err: unknown) { const msg = clerkError(err); setError(msg); throw new Error(msg); }
  }, [clerkSignUp, setSignUpActive]);
  const resetPassword = useCallback(async (email: string) => {
    try {
      setError(null);
      if (!clerkSignIn) throw new Error("Clerk not initialized");
      const result = await clerkSignIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
      if (result.status === "needs_first_factor") setError("Password reset email sent.");
    } catch (err: unknown) { const msg = clerkError(err); setError(msg); throw new Error(msg); }
  }, [clerkSignIn]);
  const updateDisplayName = useCallback(async (displayName: string) => {
    if (!clerkUser) throw new Error("No authenticated user");
    try {
      const parts = displayName.trim().split(/\s+/);
      await clerkUser.update({ firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || undefined });
    } catch (err: unknown) { throw new Error(clerkError(err)); }
  }, [clerkUser]);
  const signOut = useCallback(() => { clerkSignOut(); setCurrentToken(null); }, [clerkSignOut]);
  const getToken = useCallback(async (): Promise<string | null> => {
    try { return await clerkGetToken(); } catch { return null; }
  }, [clerkGetToken]);

  return (
    <AuthContext.Provider
      value={{ user, loading: !isLoaded, enabled: true, error, getToken, signIn, signInWithGoogle, signInWithEmail, registerWithEmail, resetPassword, updateDisplayName, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ClerkAuthInner>
        {children}
      </ClerkAuthInner>
    </ClerkProvider>
  );
}
