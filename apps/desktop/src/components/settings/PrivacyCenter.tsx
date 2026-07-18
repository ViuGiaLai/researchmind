import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type DataBackup } from "../../lib/api";
import { clearDiagnosticLog, readDiagnosticLog } from "../../lib/diagnosticLog";
import { IconCheck, IconDownload, IconLock, IconRefresh, IconSpinner, IconTrash } from "../Icons";
import { useToast } from "../shared/Toast";
import { useConfirmDialog } from "../shared/ConfirmDialog";

export const PrivacyCenter: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloudConsent, setCloudConsent] = useState(true);
  const [diagnosticsConsent, setDiagnosticsConsent] = useState(false);
  const [redactMetadata, setRedactMetadata] = useState(true);
  const [logCount, setLogCount] = useState(() => readDiagnosticLog().length);
  const [backups, setBackups] = useState<DataBackup[]>([]);
  const [dataBusy, setDataBusy] = useState(false);

  const loadBackups = () => api.listBackups().then((result) => setBackups(result.backups)).catch(() => setBackups([]));

  useEffect(() => {
    void api.getSettings().then((settings) => {
      setCloudConsent((settings as any).cloud_ai_consent !== false);
      setDiagnosticsConsent((settings as any).diagnostics_consent === true);
      setRedactMetadata((settings as any).redact_metadata_for_cloud !== false);
    }).finally(() => setLoading(false));
    void loadBackups();
  }, []);

  const createBackup = async () => {
    setDataBusy(true);
    try {
      await api.createBackup();
      await loadBackups();
      toast.addToast("success", t("privacy.backup_created"));
    } catch (error) {
      toast.addToast("error", error instanceof Error ? error.message : t("privacy.backup_error"));
    } finally { setDataBusy(false); }
  };

  const restoreBackup = async (name: string) => {
    if (!await confirm(t("privacy.restore_confirm", { name }))) return;
    setDataBusy(true);
    try {
      await api.restoreBackup(name);
      toast.addToast("success", t("privacy.restore_queued"));
    } catch (error) {
      toast.addToast("error", error instanceof Error ? error.message : t("privacy.restore_error"));
    } finally { setDataBusy(false); }
  };

  const exportData = async () => {
    setDataBusy(true);
    try {
      const blob = await api.exportPortableData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `researchmind-data-${new Date().toISOString().slice(0, 10)}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.addToast("success", t("privacy.export_ready"));
    } catch (error) {
      toast.addToast("error", error instanceof Error ? error.message : t("privacy.export_error"));
    } finally { setDataBusy(false); }
  };

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
      <section className="privacy-data">
        <div className="privacy-data__header">
          <div><strong>{t("privacy.data_control")}</strong><small>{t("privacy.data_control_desc")}</small></div>
          <div>
            <button type="button" className="rm-btn rm-btn-secondary" disabled={dataBusy} onClick={() => void exportData()}><IconDownload size={14} />{t("privacy.export_data")}</button>
            <button type="button" className="rm-btn rm-btn-secondary" disabled={dataBusy} onClick={() => void createBackup()}>{dataBusy ? <IconSpinner size={14} /> : <IconRefresh size={14} />}{t("privacy.create_backup")}</button>
          </div>
        </div>
        <div className="privacy-backups">
          {backups.length === 0 ? <small>{t("privacy.no_backups")}</small> : backups.slice(0, 5).map((backup) => (
            <div key={backup.name}>
              <span><strong>{backup.name}</strong><small>{new Date(backup.created_at).toLocaleString()} · {(backup.size / 1024 / 1024).toFixed(1)} MB</small></span>
              <button type="button" className="rm-btn rm-btn-secondary" disabled={dataBusy} onClick={() => void restoreBackup(backup.name)}>{t("privacy.restore")}</button>
            </div>
          ))}
        </div>
      </section>
      <button type="button" className="rm-btn rm-btn-primary privacy-save" onClick={() => void save()} disabled={saving}>{saving ? <IconSpinner size={14} /> : <IconCheck size={14} />}{t("common.save")}</button>
      {confirmationDialog}
    </div>
  );
};
