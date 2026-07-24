import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IconBrain,
  IconSpinner,
  IconUser,
  IconMail,
  IconLock,
  IconEye,
  IconEyeOff,
  IconSparkle,
  IconCheck,
  IconArrowRight,
} from "../Icons";
import { useAuth } from "../../lib/auth-provider";
import researchStudyImage from "../../assets/auth-research-study.jpg";
import "../../styles/auth.css";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  if (auth.loading) return <div className="auth-shell"><IconSpinner size={32} className="auth-spin" /></div>;
  if (auth.user || auth.isGuest) return <>{children}</>;

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
    } catch (err) {
      console.error("[AuthGate] submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) {
      setMessage(t("auth.enter_email_first"));
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      await auth.resetPassword(email);
      setMessage(t("auth.reset_sent"));
    } catch (err) {
      console.error("[AuthGate] reset error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-layout" aria-label={t("auth.aria_label")}>
        {/* Left Visual Pane with Vertically Centered Glassmorphism Hero Card */}
        <aside className="auth-visual" aria-hidden="true">
          <img src={researchStudyImage} alt="" />
          <div className="auth-visual-wash" />
          <div className="auth-visual-glow" />

          <div className="auth-visual-copy">
            <div className="auth-visual-header">
              <div className="auth-visual-brand">
                <IconBrain size={22} className="icon-gradient" />
                <span>ResearchMind</span>
                <span className="auth-visual-badge">{t("auth.local_first_ai")}</span>
              </div>
            </div>

            <div className="auth-visual-center">
              <div className="auth-visual-card">
                <span className="auth-visual-kicker">
                  <IconSparkle size={13} />
                  {t("auth.local_workspace")}
                </span>
                <h2>{t("auth.visual_title")}</h2>
                <p className="auth-visual-description">{t("auth.visual_copy")}</p>

                <div className="auth-visual-features">
                  <span className="feature-pill">
                    <IconCheck size={12} /> {t("auth.feature_privacy")}
                  </span>
                  <span className="feature-pill">
                    <IconCheck size={12} /> {t("auth.feature_citation")}
                  </span>
                  <span className="feature-pill">
                    <IconCheck size={12} /> {t("auth.feature_multimodel")}
                  </span>
                </div>
              </div>
            </div>

            <div className="auth-visual-footer">
              <span>{t("auth.footer_brand")}</span>
            </div>
          </div>
        </aside>

        {/* Right Form Card */}
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-brand">
            <IconBrain size={28} className="icon-gradient" />
            <span>ResearchMind</span>
          </div>

          {/* Segmented Tab Control (Login / Register) */}
          <div className="auth-tabs" role="tablist" aria-label="Auth Mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`auth-tab-btn ${mode === "login" ? "active" : ""}`}
              onClick={() => { setMode("login"); setMessage(""); }}
            >
              {t("auth.sign_in")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={`auth-tab-btn ${mode === "register" ? "active" : ""}`}
              onClick={() => { setMode("register"); setMessage(""); }}
            >
              {t("auth.sign_up")}
            </button>
          </div>

          <div className="auth-heading">
            <h1 id="auth-title">{mode === "login" ? t("auth.welcome_back") : t("auth.create_account")}</h1>
            <p className="auth-copy">{mode === "login" ? t("auth.welcome_copy") : t("auth.register_copy")}</p>
          </div>

          {/* Local Guest Mode Banner */}
          <div className="auth-guest-section">
            <button className="auth-guest-btn" type="button" onClick={() => auth.enableGuestMode()}>
              <div className="auth-guest-icon-box">
                <IconUser size={18} />
              </div>
              <div className="auth-guest-text">
                <span className="auth-guest-title">{t("auth.continue_local")}</span>
                <span className="auth-guest-hint">{t("auth.continue_local_hint")}</span>
              </div>
              <IconArrowRight size={16} className="auth-guest-arrow" />
            </button>
          </div>

          <button
            className="auth-google"
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try { await auth.signInWithGoogle(); } catch {} finally { setSubmitting(false); }
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.22-2.27H12v4.3h5.22a4.46 4.46 0 0 1-1.93 2.93v2.79h3.13c1.83-1.69 2.93-4.18 2.93-7.75Z"/>
              <path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.42-2.36l-3.13-2.79c-.87.58-1.98.92-3.29.92-2.52 0-4.66-1.7-5.42-3.99H3.35v2.88A9.7 9.7 0 0 0 12 21.75Z"/>
              <path fill="#FBBC05" d="M6.58 13.53a5.83 5.83 0 0 1 0-3.7V6.95H3.35a9.75 9.75 0 0 0 0 9.46l3.23-2.88Z"/>
              <path fill="#EA4335" d="M12 5.27c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.81 2.34 14.61 1.25 12 1.25a9.7 9.7 0 0 0-8.65 5.7l3.23 2.88C7.34 6.97 9.48 5.27 12 5.27Z"/>
            </svg>
            <span>{t("auth.continue_google")}</span>
          </button>

          <div className="auth-divider">
            <span>{t("auth.or_email")}</span>
          </div>

          <form onSubmit={submit} className="auth-form">
            <label className="auth-label">
              <span>{t("auth.email")}</span>
              <div className="auth-input-wrapper">
                <IconMail size={18} className="auth-input-icon" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </label>

            <label className="auth-label">
              <span>{t("auth.password")}</span>
              <div className="auth-input-wrapper">
                <IconLock size={18} className="auth-input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={6}
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? t("auth.hide_password") : t("auth.show_password")}
                  aria-label={t("auth.toggle_password")}
                >
                  {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>
            </label>

            {auth.error && <p className="auth-error" role="alert">{auth.error}</p>}
            {message && <p className="auth-message">{message}</p>}

            <button className="auth-primary" disabled={submitting}>
              {submitting && <IconSpinner size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />}
              <span>{submitting ? t("auth.processing") : mode === "login" ? t("auth.sign_in") : t("auth.creating_account")}</span>
            </button>
          </form>

          {mode === "login" && (
            <button className="auth-link" type="button" onClick={reset}>
              {t("auth.forgot_password")}
            </button>
          )}

          <p className="auth-switch">
            {mode === "login" ? t("auth.no_account") : t("auth.has_account")}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setMessage("");
              }}
            >
              {mode === "login" ? t("auth.sign_up") : t("auth.sign_in")}
            </button>
          </p>
        </section>
      </section>
    </main>
  );
}

