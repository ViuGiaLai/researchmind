import { useEffect, useState } from "react";
import { api, type LicenseStatus } from "../../lib/api";
import { IconCheck, IconKey, IconSpinner } from "../Icons";
import { useTranslation } from "react-i18next";

export function LicensePanel() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getLicenseStatus().then(setStatus).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : t("license.status_error"));
    });
  }, [t]);

  const activate = async () => {
    if (!token.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      setStatus(await api.activateLicense(token.trim()));
      setToken("");
      setMessage(t("license.activated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("license.invalid"));
    } finally {
      setBusy(false);
    }
  };

  const plan = status?.plan.replace("_", " ").toUpperCase() || "…";
  const planClass = "license-plan license-plan--" + (status?.active ? "active" : "free");
  return (
    <section className="settings-section settings-section--span license-panel">
      <div className="license-panel__heading">
        <div>
          <h3 className="settings-section-title"><IconKey size={18} /> {t("license.title")}</h3>
          <p className="settings-desc">{t("license.description")}</p>
        </div>
        <span className={planClass}>{plan}</span>
      </div>
      {status?.expires_at && (
        <p className="license-expiry">
          <IconCheck size={14} /> {t("license.valid_until")} {new Date(status.expires_at).toLocaleDateString(i18n.resolvedLanguage)}
        </p>
      )}
      <div className="license-activate">
        <label>
          {t("license.activation_code")}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={t("license.placeholder")}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="button" className="settings-save-btn" disabled={busy || !token.trim()} onClick={activate}>
          {busy ? <IconSpinner size={15} /> : <IconKey size={15} />} {t("license.activate")}
        </button>
      </div>
      {message && <p className="license-message" role="status">{message}</p>}
    </section>
  );
}
