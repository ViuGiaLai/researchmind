import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  ClerkProvider,
  useUser as useClerkUser,
  useAuth as useClerkAuth,
  useSignIn as useClerkSignIn,
  useSignUp as useClerkSignUp,
  useClerk,
  AuthenticateWithRedirectCallback,
} from "@clerk/clerk-react";
import { setCurrentToken } from "./auth-token";

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

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";
const clerkConfigured = Boolean(clerkPublishableKey);
const OAUTH_CALLBACK_PATH = "/sso-callback";

/** Completes Clerk's OAuth exchange at the redirect URL configured below. */
export function ClerkOAuthCallback() {
  if (!clerkConfigured) return null;

  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    />
  );
}

function getClerkSignInUrl(): string {
  try {
    const parts = clerkPublishableKey.split("_");
    const b64 = parts[parts.length - 1];
    const decoded = atob(b64);
    const apiDomain = decoded.replace(/\$.*$/, "");
    const signInDomain = apiDomain.replace(/\.clerk\.accounts\.dev$/, ".accounts.dev");
    return `https://${signInDomain}/sign-in`;
  } catch (e) {
    return "";
  }
}

function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded, isSignedIn } = useClerkUser();
  const { getToken: clerkGetToken, signOut: clerkSignOut } = useClerkAuth();
  const { signIn: clerkSignIn, setActive: clerkSetActive } = useClerkSignIn();
  const { signUp: clerkSignUp, setActive: setSignUpActive } = useClerkSignUp();
  const clerk = useClerk();
  const [error, setError] = useState<string | null>(null);

  const activeUser: AuthUser | null =
    isSignedIn && clerkUser ? mapClerkUser(clerkUser) : null;

  const loading = !isLoaded;
  const enabled = true;

  useEffect(() => {
    if (isSignedIn) {
      clerkGetToken().then((t) => setCurrentToken(t || null));
    } else {
      setCurrentToken(null);
    }
  }, [isSignedIn, clerkGetToken]);

  useEffect(() => {
    console.log("[Auth] ClerkAuthProvider state:", {
      isLoaded, isSignedIn, clerkUser: clerkUser?.id || null,
      activeUser: activeUser?.id || null, loading, error,
    });
  }, [isLoaded, isSignedIn, clerkUser, activeUser, loading, error]);

  const signIn = useCallback(() => {
    const signInUrl = getClerkSignInUrl();
    if (!signInUrl) return;
    const returnUrl = encodeURIComponent(window.location.origin);
    window.location.href = signInUrl + "?redirect_url=" + returnUrl;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      console.log("[Auth] signInWithEmail - creating sign-in...");
      const result = await clerkSignIn.create({ identifier: email.trim(), password });
      console.log("[Auth] signInWithEmail - result:", result.status, "sessionId:", result.createdSessionId);
      if (result.status === "complete") {
        if (!result.createdSessionId) {
          const msg = "Sign-in returned 'complete' but no session ID was provided";
          setError(msg);
          throw new Error(msg);
        }
        console.log("[Auth] signInWithEmail - activating session...");
        await clerkSetActive({ session: result.createdSessionId });
        console.log("[Auth] signInWithEmail - after setActive:", {
          clerkUser: clerk.user?.id || null,
          clerkSession: clerk.session?.id || null,
        });
      } else if (result.status === "needs_second_factor") {
        const msg = "Two-factor authentication is required. Please check your email for a verification code.";
        setError(msg);
        throw new Error(msg);
      } else {
        const msg = "Incomplete sign-in: " + result.status;
        setError(msg);
        throw new Error(msg);
      }
    } catch (err: unknown) {
      const msg = clerkError(err);
      console.error("[Auth] signInWithEmail error:", msg);
      setError(msg);
      throw new Error(msg);
    }
  }, [clerkSignIn, clerkSetActive]);

  const signInWithGoogle = useCallback(async () => {
    try {
      setError(null);
      const callbackUrl = window.location.origin + OAUTH_CALLBACK_PATH;
      await clerkSignIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: callbackUrl,
        redirectUrlComplete: window.location.origin + "/",
      });
    } catch (err: unknown) {
      const msg = clerkError(err);
      setError(msg);
      throw new Error(msg);
    }
  }, [clerkSignIn]);

  const registerWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      const result = await clerkSignUp.create({ emailAddress: email.trim(), password });
      if (result.status === "complete") {
        if (!result.createdSessionId) {
          setError("Registration completed but no session ID was provided");
          throw new Error("No session ID");
        }
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

  const updateDisplayName = useCallback(async (displayName: string) => {
    if (!clerkUser) throw new Error("No authenticated user");
    try {
      const parts = displayName.trim().split(/\s+/);
      await clerkUser.update({ firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || undefined });
    } catch (err: unknown) { throw new Error(clerkError(err)); }
  }, [clerkUser]);

  const signOut = useCallback(() => {
    setError(null);
    clerkSignOut();
    setCurrentToken(null);
  }, [clerkSignOut]);

  const getToken = useCallback(async (): Promise<string | null> => {
    try { return await clerkGetToken(); } catch { return null; }
  }, [clerkGetToken]);

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

function FallbackAuthProvider({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(() => {}, []);
  const signInWithGoogle = useCallback(async () => {}, []);
  const signInWithEmail = useCallback(async (_email: string, _password: string) => {
    setError("Authentication is not configured. Please set up Clerk.");
    throw new Error("No auth provider configured");
  }, []);
  const registerWithEmail = useCallback(async (_email: string, _password: string) => {
    setError("Authentication is not configured. Please set up Clerk.");
    throw new Error("No auth provider configured");
  }, []);
  const resetPassword = useCallback(async (_email: string) => {
    setError("Authentication is not configured.");
  }, []);
  const updateDisplayName = useCallback(async (_displayName: string) => {
    throw new Error("No authenticated user");
  }, []);
  const signOut = useCallback(() => {
    setCurrentToken(null);
  }, []);
  const getToken = useCallback(async (): Promise<string | null> => null, []);

  return (
    <AuthContext.Provider
      value={{
        user: null, loading: false, enabled: false, error,
        getToken, signIn, signInWithGoogle, signInWithEmail,
        registerWithEmail, resetPassword, updateDisplayName, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function PluggableAuthProvider({ children }: { children: React.ReactNode }) {
  if (clerkConfigured) {
    const appUrl = window.location.origin;
    const clerkSignInPageUrl = getClerkSignInUrl();
    return (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        signInUrl={clerkSignInPageUrl}
        signInFallbackRedirectUrl={appUrl}
        signUpFallbackRedirectUrl={appUrl}
      >
        <ClerkAuthProvider>
          {children}
        </ClerkAuthProvider>
      </ClerkProvider>
    );
  }

  return <FallbackAuthProvider>{children}</FallbackAuthProvider>;
}
