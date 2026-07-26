import React, { useEffect, useState } from "react";
import { Button, Card, CardContent, EmptyState, Input } from "@researchmind/ui";
import { KeyRound, Trash2 } from "lucide-react";
import type { ApiKey } from "@researchmind/types";
import { createApiKey, listApiKeys, revokeApiKey } from "@/services/api-keys";
import { Loading } from "@/components/common/Loading";
import { formatRelativeTime } from "@researchmind/utils";
import { t, tpl } from "@/i18n";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listApiKeys();
      setKeys(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await createApiKey(name.trim());
      setSecret(created.secret);
      setName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    setBusy(true);
    try {
      await revokeApiKey(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label={t("common.loading")} />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{t("apiKeys.title")}</h2>
        <p className="page-subtitle">{t("apiKeys.subtitle")}</p>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {secret ? (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium text-warning">{t("apiKeys.secretWarning.title")}</p>
            <p className="text-xs text-muted-foreground">{t("apiKeys.secretWarning.description")}</p>
            <code className="block break-all rounded-lg bg-muted/80 px-3 py-2 text-xs text-primary">
              {secret}
            </code>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(secret)}>
                {t("common.copy")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>
                {t("apiKeys.dismiss")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">{t("apiKeys.keyNameLabel")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("apiKeys.keyNamePlaceholder")}
            />
          </div>
          <Button onClick={onCreate} loading={busy} disabled={!name.trim()}>
            {t("apiKeys.createKey")}
          </Button>
        </CardContent>
      </Card>

      {keys.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-8 w-8" />}
          title={t("apiKeys.empty.title")}
          description={t("apiKeys.empty.description")}
          action={<Button size="sm" variant="secondary">{t("apiKeys.empty.action")}</Button>}
        />
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <Card key={k.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">{k.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {k.prefix}… · {tpl("apiKeys.created", { time: formatRelativeTime(k.createdAt) })}
                    {k.lastUsedAt ? ` · ${tpl("apiKeys.lastUsed", { time: formatRelativeTime(k.lastUsedAt) })}` : ""}
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRevoke(k.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("apiKeys.revoke")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
