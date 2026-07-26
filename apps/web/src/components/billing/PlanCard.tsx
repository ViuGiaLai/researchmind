import React from "react";
import type { BillingPlan } from "@researchmind/types";
import { Badge, Button, Card, CardContent } from "@researchmind/ui";
import { formatCurrency } from "@researchmind/utils";
import { Check } from "lucide-react";

export function PlanCard({
  plan,
  current,
  onSelect,
}: {
  plan: BillingPlan;
  current?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Card className={plan.highlighted ? "border-sky-500/40 shadow-glow" : ""}>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-slate-50">{plan.name}</h3>
          {current ? <Badge tone="success">Current</Badge> : null}
        </div>
        <div className="font-display text-3xl font-bold text-sky-300">
          {formatCurrency(plan.priceMonthly, plan.currency)}
          <span className="text-sm font-normal text-slate-500">/mo</span>
        </div>
        <ul className="space-y-2 text-sm text-slate-300">
          {(plan.features ?? []).map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              {f}
            </li>
          ))}
        </ul>
        <Button className="w-full" variant={plan.highlighted ? "primary" : "secondary"} onClick={onSelect}>
          {current ? "Manage plan" : "Choose plan"}
        </Button>
      </CardContent>
    </Card>
  );
}
