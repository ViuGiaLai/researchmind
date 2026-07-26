import React, { useState } from "react";
import { useBackups } from "@/hooks/useBackups";
import { BackupList } from "@/components/backup/BackupList";
import { Tabs } from "@/components/common/Tabs";
import { Button, EmptyState } from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";
import { Database } from "lucide-react";
import { t } from "@/i18n";

export default function BackupsPage() {
  const { backups, loading, error, createBackup, restoreBackup, refresh } = useBackups();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState("all");

  if (loading) return <Loading label={t("common.loading")} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">{t("backups.title")}</h2>
          <p className="page-subtitle">{t("backups.subtitle")}</p>
        </div>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            setActionError("");
            try {
              await createBackup();
              setMsg(t("backups.created"));
              await refresh();
            } catch (e) {
              setActionError(e instanceof Error ? e.message : t("common.error.unknown"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("backups.createBackup")}
        </Button>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {actionError ? <p className="text-sm text-rose-400">{actionError}</p> : null}
      {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: "all", label: t("backups.types.all") },
          { id: "workspace", label: t("backups.types.workspace") },
          { id: "settings", label: t("backups.types.settings") },
          { id: "prompts", label: t("backups.types.prompts") },
        ]}
      />
      {!backups.length ? (
        <EmptyState
          icon={<Database className="h-8 w-8" />}
          title={t("backups.empty.title")}
          description={t("backups.empty.description")}
          action={<Button size="sm" variant="secondary" onClick={async () => { setBusy(true); try { await createBackup(); setMsg(t("backups.created")); await refresh(); } catch (e) { setActionError(e instanceof Error ? e.message : t("common.error.unknown")); } finally { setBusy(false); } }}>{t("backups.createBackup")}</Button>}
        />
      ) : (
        <BackupList
          items={backups}
          onRestore={async (id) => {
            setActionError("");
            setMsg("");
            try {
              await restoreBackup(id);
              setMsg(`${t("backups.btn.restore")}: ${id}`);
            } catch (e) {
              setActionError(e instanceof Error ? e.message : t("common.error.unknown"));
            }
          }}
        />
      )}
    </div>
  );
}
