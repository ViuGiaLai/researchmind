import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconCheck, IconCopy, IconEdit, IconKey, IconLock, IconSpinner, IconUser } from "../Icons";
import { useAuth } from "../../lib/auth-provider";
import "./account.css";

interface AccountViewProps {
  onOpenSettings: () => void;
}

export function AccountView({ onOpenSettings }: AccountViewProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const user = auth.user;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const provider = useMemo(
    () => user?.providerData?.find((item) => item.providerId !== "firebase")?.providerId || "password",
    [user]
  );
  const providerLabel =
    provider === "google.com" ? "Google" :
    provider === "clerk" ? "Clerk" :
    t("account.email_password");
  const displayName = user?.name || user?.email?.split("@")[0] || t("account.researcher");

  if (!user) return (
    <section className="account-view">
      <header className="account-header">
        <p className="account-eyebrow">{t("account.eyebrow")}</p>
        <h1>{t("auth.optional_sign_in")}</h1>
        <p>{t("auth.optional_sign_in_hint")}</p>
      </header>
      <section className="account-profile-card" style={{ justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div className="account-avatar-large" style={{ width: 64, height: 64, fontSize: "1.6rem" }}>
            <IconUser size={28} />
          </div>
          <h2>{t("auth.guest")}</h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", maxWidth: 360, margin: 0 }}>{t("auth.guest_hint")}</p>
        </div>
      </section>
    </section>
  );

  const userId = user.uid || user.id;

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setNotice("");
    try {
      await auth.updateDisplayName(name);
      setEditing(false);
      setNotice(t("account.name_updated"));
    } catch {
      setNotice(t("account.name_update_failed"));
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!user.email) return;
    setNotice("");
    try {
      await auth.resetPassword(user.email);
      setNotice(t("account.reset_sent"));
    } catch {
      setNotice(t("account.reset_failed"));
    }
  };

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setNotice(t("account.copy_failed"));
    }
  };

  return (
    <section className="account-view">
      <header className="account-header">
        <p className="account-eyebrow">{t("account.eyebrow")}</p>
        <h1>{t("account.title")}</h1>
        <p>{t("account.description")}</p>
      </header>

      <section className="account-profile-card">
        <div className="account-profile-top">
          <div className="account-avatar-large">
            {user.imageUrl ? (
              <img src={user.imageUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              (user.name || user.email || "R").slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="account-hero-info">
            <h2>{user.name || t("account.default_name")}</h2>
            <div className="account-hero-email">
              {user.email}
            </div>
          </div>
        </div>
        <div className="account-profile-actions">
          <button className="account-secondary-btn" type="button" onClick={() => { setName(displayName); setEditing(true); }}>
            <IconEdit size={14} /> {t("account.edit_profile")}
          </button>
          <button className="account-signout-btn" type="button" onClick={() => auth.signOut()}>{t("auth.sign_out")}</button>
        </div>
      </section>

      <div className="account-details-grid">
        <section className="account-section">
          <div className="account-section-heading">
            <IconUser size={18} />
            <div>
              <h2>{t("account.profile")}</h2>
              <p>{t("account.profile_copy")}</p>
            </div>
          </div>
          {editing ? (
            <div className="account-edit-row">
              <label>
                {t("account.display_name")}
                <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} autoFocus />
              </label>
              <div className="account-edit-actions">
                <button className="account-primary-btn" type="button" disabled={saving || !name.trim()} onClick={saveName}>
                  {saving ? <IconSpinner size={14} /> : <IconCheck size={14} />} {t("common.save")}
                </button>
                <button className="account-cancel-btn" type="button" onClick={() => setEditing(false)}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <dl className="account-facts">
              <div>
                <dt>{t("account.display_name")}</dt>
                <dd>{displayName}</dd>
              </div>
              <div>
                <dt>{t("auth.email")}</dt>
                <dd>{user.email || t("account.no_email")}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="account-section">
          <div className="account-section-heading">
            <IconKey size={18} />
            <div>
              <h2>{t("account.security")}</h2>
              <p>{t("account.security_copy")}</p>
            </div>
          </div>
          <dl className="account-facts">
            <div>
              <dt>{t("account.sign_in_method")}</dt>
              <dd>{providerLabel}</dd>
            </div>
            <div>
              <dt>{t("account.account_id")}</dt>
              <dd className="account-uid">
                {userId}
                <button type="button" onClick={copyUid} title={t("account.copy_account_id")}>
                  {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                </button>
              </dd>
            </div>
          </dl>
          <div className="account-security-actions">
            {provider !== "google.com" && (
              <button className="account-secondary-btn" type="button" onClick={resetPassword}>
                {t("account.reset_password")}
              </button>
            )}
            <button className="account-signout-btn" type="button" onClick={() => auth.signOut()}>
              {t("account.sign_out_device")}
            </button>
          </div>

          <div className="account-local-card">
            <IconLock size={16} />
            <div>
              <h2>{t("account.local_data_title")}</h2>
              <p>{t("account.local_data_copy")}</p>
              <button className="account-text-btn" type="button" onClick={onOpenSettings}>
                {t("account.open_data_controls")}
              </button>
            </div>
          </div>
        </section>
      </div>
      {notice && <p className="account-notice" role="status">{notice}</p>}
    </section>
  );
}

