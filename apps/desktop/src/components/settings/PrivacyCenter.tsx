import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { clearDiagnosticLog, readDiagnosticLog } from "../../lib/diagnosticLog";
import { IconCheck, IconLock, IconSpinner, IconTrash } from "../Icons";
import { useToast } from "../shared/Toast";

export const PrivacyCenter: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloudConsent, setCloudConsent] = useState(true);
  const [diagnosticsConsent, setDiagnosticsConsent] = useState(false);
  const [redactMetadata, setRedactMetadata] = useState(true);
  const [logCount, setLogCount] = useState(() => readDiagnosticLog().length);

  useEffect(() => {
    void api.getSettings().then((settings) => {
      setCloudConsent((settings as any).cloud_ai_consent !== false);
      setDiagnosticsConsent((settings as any).diagnostics_consent === true);
      setRedactMetadata((settings as any).redact_metadata_for_cloud !== false);
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateSettings({
        cloud_ai_consent: cloudConsent,
        diagnostics_consent: diagnosticsConsent,
        redact_metadata_for_cloud: redactMetadata,
        ...(!cloudConsent ? { llm_mode: "local" } : {}),
      });
      toast.addToast("success", t("privacy.saved"));
    } catch (error) {
      toast.addToast("error", error instanceof Error ? error.message : t("privacy.save_error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="rm-loading"><IconSpinner size={18} />{t("common.loading")}</div>;

  return (
    <div className="privacy-center">
      <section className="privacy-summary">
        <IconLock size={22} />
        <div><h3>{t("privacy.local_first")}</h3><p>{t("privacy.local_first_desc")}</p></div>
      </section>
      <section className="privacy-controls">
        <label><span><strong>{t("privacy.cloud_ai")}</strong><small>{t("privacy.cloud_ai_desc")}</small></span><input type="checkbox" checked={cloudConsent} onChange={(event) => setCloudConsent(event.target.checked)} /></label>
        <label><span><strong>{t("privacy.redact_metadata")}</strong><small>{t("privacy.redact_metadata_desc")}</small></span><input type="checkbox" checked={redactMetadata} onChange={(event) => setRedactMetadata(event.target.checked)} disabled={!cloudConsent} /></label>
        <label><span><strong>{t("privacy.diagnostics")}</strong><small>{t("privacy.diagnostics_desc")}</small></span><input type="checkbox" checked={diagnosticsConsent} onChange={(event) => setDiagnosticsConsent(event.target.checked)} /></label>
      </section>
      <section className="privacy-log">
        <div><strong>{t("privacy.local_log")}</strong><small>{t("privacy.log_entries", { count: logCount })}</small></div>
        <button type="button" className="rm-btn rm-btn-secondary" onClick={() => { clearDiagnosticLog(); setLogCount(0); }} disabled={!logCount}><IconTrash size={14} />{t("privacy.clear_log")}</button>
      </section>
      <button type="button" className="rm-btn rm-btn-primary privacy-save" onClick={() => void save()} disabled={saving}>{saving ? <IconSpinner size={14} /> : <IconCheck size={14} />}{t("common.save")}</button>
    </div>
  );
};
