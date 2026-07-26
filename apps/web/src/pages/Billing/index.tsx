import React, { useEffect, useState } from "react";
import type { BillingPlan, PlanTier } from "@researchmind/types";
import { activateLicense, listPlans } from "@/services/billing";
import { PlanCard } from "@/components/billing/PlanCard";
import { Button, Card, CardContent, EmptyState, Input } from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";
import { CreditCard } from "lucide-react";
import { t } from "@/i18n";

export default function BillingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [current, setCurrent] = useState<PlanTier>("free");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await listPlans();
      setPlans(Array.isArray(res.data) ? res.data : []);
      setCurrent(res.current || "free");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load license status");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <Loading label={t("common.loading")} />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{t("billing.title")}</h2>
        <p className="page-subtitle">{t("billing.subtitle")}</p>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}

      {plans.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-8 w-8" />}
          title={t("billing.comingSoon.title")}
          description={t("billing.comingSoon.description")}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} current={p.id === current} />
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3">
          <h3 className="font-semibold text-foreground">{t("billing.activate.title")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("billing.activate.description")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              label={t("billing.activate.title")}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("billing.activate.placeholder")}
            />
            <Button
              className="sm:mt-6"
              loading={busy}
              disabled={!token.trim()}
              onClick={async () => {
                setBusy(true);
                setMsg("");
                setError("");
                try {
                  await activateLicense(token.trim());
                  setToken("");
                  setMsg(t("billing.activate.success"));
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Activation failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("billing.activate.btn")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
