import React, { useEffect, useState } from "react";
import type { BillingPlan } from "@researchmind/types";
import { DEFAULT_PLANS, listPlansOrDefault } from "@/services/billing";
import { PlanCard } from "@/components/billing/PlanCard";
import { Loading } from "@/components/common/Loading";

export default function PricingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>(DEFAULT_PLANS);
  const [current, setCurrent] = useState<string>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listPlansOrDefault()
      .then((res) => {
        if (cancelled) return;
        setPlans(Array.isArray(res.data) && res.data.length > 0 ? res.data : DEFAULT_PLANS);
        setCurrent(res.current || "free");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="text-center">
        <h1 className="page-title">Simple, transparent pricing</h1>
        <p className="page-subtitle mx-auto max-w-xl">
          Free for local research. Pro unlocks cloud reports & backups. Lab adds team collaboration.
        </p>
      </div>
      {loading ? (
        <Loading />
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {(plans ?? DEFAULT_PLANS).map((p) => (
            <PlanCard key={p.id} plan={p} current={p.id === current} />
          ))}
        </div>
      )}
    </div>
  );
}
