import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useAuth as useClerkAuth,
  useClerk,
  useSignIn,
  useSignUp,
  useUser,
} from "@clerk/clerk-react";
import type { User } from "@researchmind/types";
import { clerkConfigured, clerkErrorMessage } from "@/lib/clerk";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "@/lib/firebase";
import {
  clearSession,
  ensureWebDevice,
  getStoredUser,
  getToken as getStoredToken,
  mapAuthUser,
  persistSession,
  syncCloudProfile,
} from "@/services/auth-session";
import { track } from "@/lib/analytics";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  provider: "clerk" | "firebase" | "none";
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signIn, isLoaded: signInLoaded, setActive: setSignInActive } = useSignIn();
  const { signUp, isLoaded: signUpLoaded, setActive: setSignUpActive } = useSignUp();
  const { signOut } = useClerk();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      if (!isLoaded) return;
      if (!isSignedIn || !clerkUser) {
        clearSession();
        if (!cancelled) {
          setUser(null);
          setToken(null);
          setHydrated(true);
        }
        return;
      }
      try {
        const t = (await getToken()) || null;
        const local = mapAuthUser({
          id: clerkUser.id,
          email: clerkUser.primaryEmailAddress?.emailAddress,
          name: clerkUser.fullName || clerkUser.firstName || clerkUser.username,
          avatarUrl: clerkUser.imageUrl,
          emailVerified: clerkUser.primaryEmailAddress?.verification?.status === "verified",
        });
        if (t) persistSession(local, t);
        const synced = t ? await syncCloudProfile(local) : local;
        if (t) persistSession(synced, t);
        if (!cancelled) {
          setUser(synced);
          setToken(t);
          setHydrated(true);
        }
        void ensureWebDevice();
      } catch {
        if (!cancelled) {
          setUser(getStoredUser());
          setToken(getStoredToken());
          setHydrated(true);
        }
      }
    }
    void sync();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, clerkUser, getToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (!signInLoaded || !signIn || !setSignInActive) {
        throw new Error("Clerk is not ready yet. Please try again.");
      }
      try {
        const result = await signIn.create({
          identifier: email.trim(),
          password,
        });
        if (result.status === "complete") {
          if (!result.createdSessionId) {
            throw new Error("Sign-in completed but no session was created.");
          }
          await setSignInActive({ session: result.createdSessionId });
          track("login");

          let t: string | null = null;
          for (let i = 0; i < 15; i++) {
            t = await getToken();
            if (t) break;
            await new Promise((r) => setTimeout(r, 80));
          }
          if (!t) throw new Error("Signed in but session token is not ready yet. Retry.");

          const local = mapAuthUser({
            id: clerkUser?.id || result.createdSessionId,
            email: email.trim(),
            name: clerkUser?.fullName || email.trim(),
            avatarUrl: clerkUser?.imageUrl,
          });
          persistSession(local, t);
          const synced = await syncCloudProfile(local);
          persistSession(synced, t);
          setUser(synced);
          setToken(t);
          void ensureWebDevice();
          return synced;
        }
        if (result.status === "needs_second_factor") {
          throw new Error(
            "Two-factor authentication is required. Check your email for a verification code.",
          );
        }
        throw new Error(`Incomplete sign-in: ${result.status}`);
      } catch (err) {
        throw new Error(clerkErrorMessage(err));
      }
    },
    [signIn, signInLoaded, setSignInActive, getToken, clerkUser],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      if (!signUpLoaded || !signUp || !setSignUpActive) {
        throw new Error("Clerk is not ready yet. Please try again.");
      }
      try {
        const result = await signUp.create({
          emailAddress: email.trim(),
          password,
          firstName: name.trim().split(/\s+/)[0] || undefined,
          lastName: name.trim().split(/\s+/).slice(1).join(" ") || undefined,
        });

        if (result.status === "complete") {
          if (!result.createdSessionId) {
            throw new Error("Registration completed but no session was created.");
          }
          await setSignUpActive({ session: result.createdSessionId });
          track("register");

          let t: string | null = null;
          for (let i = 0; i < 15; i++) {
            t = await getToken();
            if (t) break;
            await new Promise((r) => setTimeout(r, 80));
          }
          if (!t) throw new Error("Registered but session token is not ready yet. Sign in instead.");

          const local = mapAuthUser({
            id: result.createdUserId || email.trim(),
            email: email.trim(),
            name: name.trim() || email.trim(),
          });
          persistSession(local, t);
          const synced = await syncCloudProfile(local);
          persistSession(synced, t);
          setUser(synced);
          setToken(t);
          void ensureWebDevice();
          return synced;
        }

        // Email verification often required
        if (result.status === "missing_requirements") {
          try {
            await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
          } catch {
            /* ignore prepare failures */
          }
          throw new Error(
            "Check your email to verify the account, then sign in. (Clerk requires email verification.)",
          );
        }
        throw new Error(`Incomplete sign-up: ${result.status}`);
      } catch (err) {
        throw new Error(clerkErrorMessage(err));
      }
    },
    [signUp, signUpLoaded, setSignUpActive, getToken],
  );

  const logout = useCallback(async () => {
    await signOut();
    clearSession();
    setUser(null);
    setToken(null);
    track("logout");
  }, [signOut]);

  const requestPasswordReset = useCallback(
    async (email: string) => {
      if (!signInLoaded || !signIn) {
        throw new Error("Clerk is not ready yet.");
      }
      try {
        await signIn.create({
          strategy: "reset_password_email_code",
          identifier: email.trim(),
        });
      } catch (err) {
        throw new Error(clerkErrorMessage(err));
      }
    },
    [signIn, signInLoaded],
  );

  const loginWithGoogle = useCallback(async () => {
    if (!signInLoaded || !signIn) {
      throw new Error("Clerk is not ready yet. Please try again.");
    }
    try {
      track("login_google");
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/sso-callback`,
        redirectUrlComplete: `${window.location.origin}/app`,
      });
    } catch (err) {
      throw new Error(clerkErrorMessage(err));
    }
  }, [signIn, signInLoaded]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      hydrated: hydrated && isLoaded,
      provider: "clerk",
      login,
      register,
      loginWithGoogle,
      logout,
      requestPasswordReset,
    }),
    [
      user,
      token,
      hydrated,
      isLoaded,
      login,
      register,
      loginWithGoogle,
      logout,
      requestPasswordReset,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
    setToken(getStoredToken());
    setHydrated(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!firebaseConfigured) {
      throw new Error("Auth is not configured. Set VITE_CLERK_PUBLISHABLE_KEY or VITE_FIREBASE_*.");
    }
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth unavailable");
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const t = await cred.user.getIdToken();
    const local = mapAuthUser({
      id: cred.user.uid,
      email: cred.user.email || email,
      name: cred.user.displayName || email,
      avatarUrl: cred.user.photoURL,
      emailVerified: cred.user.emailVerified,
      createdAt: cred.user.metadata.creationTime,
    });
    persistSession(local, t);
    const synced = await syncCloudProfile(local);
    persistSession(synced, t);
    setUser(synced);
    setToken(t);
    void ensureWebDevice();
    track("login");
    return synced;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    if (!firebaseConfigured) {
      throw new Error("Auth is not configured. Set VITE_CLERK_PUBLISHABLE_KEY or VITE_FIREBASE_*.");
    }
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth unavailable");
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
    const t = await cred.user.getIdToken();
    const local = mapAuthUser({
      id: cred.user.uid,
      email: cred.user.email || email,
      name: name.trim() || email,
      avatarUrl: cred.user.photoURL,
      emailVerified: cred.user.emailVerified,
    });
    persistSession(local, t);
    const synced = await syncCloudProfile(local);
    persistSession(synced, t);
    setUser(synced);
    setToken(t);
    void ensureWebDevice();
    track("register");
    return synced;
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch {
        /* ignore */
      }
    }
    clearSession();
    setUser(null);
    setToken(null);
    track("logout");
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!firebaseConfigured) throw new Error("Auth is not configured.");
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth unavailable");
    await sendPasswordResetEmail(auth, email);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    throw new Error(
      "Google sign-in on Web uses Clerk. Set VITE_CLERK_PUBLISHABLE_KEY (same as Desktop).",
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      hydrated,
      provider: firebaseConfigured ? "firebase" : "none",
      login,
      register,
      loginWithGoogle,
      logout,
      requestPasswordReset,
    }),
    [user, token, hydrated, login, register, loginWithGoogle, logout, requestPasswordReset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (clerkConfigured) {
    return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
  }
  return <FirebaseAuthProvider>{children}</FirebaseAuthProvider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}

export type { User };
