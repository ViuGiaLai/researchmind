import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconBrain, IconSpinner } from "../Icons";
import { useAuth } from "../../lib/auth-provider";
import researchStudyImage from "../../assets/auth-research-study.jpg";
import "../../styles/auth.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8765";
const backendHost = new URL(BACKEND_URL).hostname;
const localBackend = backendHost === "127.0.0.1" || backendHost === "localhost" || backendHost === "::1";
const requireBackendProfile = import.meta.env.VITE_BACKEND_AUTH_REQUIRED === "true" || !localBackend;
const authRequired = import.meta.env.VITE_AUTH_REQUIRED === "true" || requireBackendProfile;
const quickLoginEnabled = import.meta.env.VITE_QUICK_LOGIN === "true";
const GUEST_MODE_STORAGE_KEY = "researchmind-guest-mode";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [guestMode, setGuestMode] = useState(() => !authRequired && localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "true");

  useEffect(() => {
    const openAuth = () => {
      localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
      setGuestMode(false);
    };
    window.addEventListener("researchmind:open-auth", openAuth);
    return () => window.removeEventListener("researchmind:open-auth", openAuth);
  }, []);

  useEffect(() => {
    if (!auth.user) return;
    localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
    setGuestMode(false);
  }, [auth.user]);

  useEffect(() => {
    // removed backend check since we are using pluggable auth
  }, [auth.user, t]);

  if (auth.loading) return <div className="auth-shell"><IconSpinner size={30} className="auth-spin" /></div>;
  if (auth.user) return <>{children}</>;
  if (!authRequired && guestMode) return <>{children}</>;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      if (mode === "login") {
        await auth.signInWithEmail(email, password);
      } else {
        await auth.registerWithEmail(email, password);
      }
    } catch {
      // The provider exposes a translated error below the form.
    } finally {
      setSubmitting(false);
    }
  };

  const reset = async () => {
    // Unsupported in MVP mock
  };

  return (
    <main className="auth-shell">
      <section className="auth-layout" aria-label={t("auth.aria_label")}>
        <aside className="auth-visual" aria-hidden="true">
          <img src={researchStudyImage} alt="" />
          <div className="auth-visual-wash" />
          <div className="auth-visual-copy">
            <span className="auth-visual-brand">ResearchMind</span>
            <div>
              <p className="auth-visual-kicker">{t("auth.local_workspace")}</p>
              <h2>{t("auth.visual_title")}</h2>
              <p className="auth-visual-description">{t("auth.visual_copy")}</p>
            </div>
          </div>
        </aside>
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-brand"><IconBrain size={28} className="icon-gradient" /><span>ResearchMind</span></div>
          <div className="auth-heading">
            <h1 id="auth-title">{mode === "login" ? t("auth.welcome_back") : t("auth.create_account")}</h1>
            <p className="auth-copy">{mode === "login" ? t("auth.welcome_copy") : t("auth.register_copy")}</p>
          </div>

          {profileError ? (
            <div className="auth-error" role="alert">
              {profileError}<button type="button" onClick={() => auth.signOut()}>{t("auth.sign_out")}</button>
            </div>
          ) : (
            <>
              {quickLoginEnabled && (
                <button className="auth-quick-login" type="button" onClick={() => {
                  auth.signIn();
                  localStorage.setItem("researchmind:last-tab", "library");
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Quick Login (Dev)
                  <span>Đăng nhập tức thì — không cần mật khẩu</span>
                </button>
              )}
              {!authRequired && (
                <button className="auth-guest" type="button" onClick={() => {
                  localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
                  localStorage.setItem("researchmind:last-tab", "library");
                  window.dispatchEvent(new Event("researchmind:guest-enter"));
                  setGuestMode(true);
                }}>
                  {t("auth.continue_local")}
                  <span>{t("auth.continue_local_hint")}</span>
                </button>
              )}
              <button className="auth-google" type="button" disabled={submitting} onClick={async () => {
                setSubmitting(true);
                try { await auth.signInWithGoogle(); } catch {} finally { setSubmitting(false); }
              }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.22-2.27H12v4.3h5.22a4.46 4.46 0 0 1-1.93 2.93v2.79h3.13c1.83-1.69 2.93-4.18 2.93-7.75Z"/><path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.42-2.36l-3.13-2.79c-.87.58-1.98.92-3.29.92-2.52 0-4.66-1.7-5.42-3.99H3.35v2.88A9.7 9.7 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.58 13.53a5.83 5.83 0 0 1 0-3.7V6.95H3.35a9.75 9.75 0 0 0 0 9.46l3.23-2.88Z"/><path fill="#EA4335" d="M12 5.27c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.81 2.34 14.61 1.25 12 1.25a9.7 9.7 0 0 0-8.65 5.7l3.23 2.88C7.34 6.97 9.48 5.27 12 5.27Z"/></svg>
                {t("auth.continue_google")}
              </button>
              <div className="auth-divider"><span>{t("auth.or_email")}</span></div>
              <form onSubmit={submit} className="auth-form">
                <label>{t("auth.email")}<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label>{t("auth.password")}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                {auth.error && <p className="auth-error" role="alert">{auth.error}</p>}
                {message && <p className="auth-message">{message}</p>}
                <button className="auth-primary" disabled={submitting}>{submitting ? t("auth.processing") : mode === "login" ? t("auth.sign_in") : t("auth.creating_account")}</button>
              </form>
              {mode === "login" && <button className="auth-link" type="button" onClick={reset}>{t("auth.forgot_password")}</button>}
              <p className="auth-switch">{mode === "login" ? t("auth.no_account") : t("auth.has_account")} <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }}>{mode === "login" ? t("auth.sign_up") : t("auth.sign_in")}</button></p>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
