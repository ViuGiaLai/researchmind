import React, { useState } from "react";
import { Button, Input, Card, CardContent } from "@researchmind/ui";
import { t } from "@/i18n";

export default function FeedbackPage() {
  const [sent, setSent] = useState(false);
  const [type, setType] = useState("bug");
  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{t("feedback.title")}</h2>
        <p className="page-subtitle">{t("feedback.subtitle")}</p>
      </div>
      <Card>
        <CardContent>
          <form
            className="max-w-lg space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-300">{t("feedback.typeLabel")}</span>
              <select
                className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-100"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="bug">{t("feedback.type.bug")}</option>
                <option value="feature">{t("feedback.type.feature")}</option>
                <option value="other">{t("feedback.type.other")}</option>
              </select>
            </label>
            <Input label={t("feedback.subjectLabel")} required />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-300">{t("feedback.message")}</span>
              <textarea className="min-h-[140px] rounded-xl border border-slate-700 bg-slate-950 p-3" required />
            </label>
            {sent ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                <p className="font-medium text-emerald-300">{t("feedback.thankYou.title")}</p>
                <p className="mt-1 text-sm text-emerald-400">{t("feedback.thankYou.description")}</p>
              </div>
            ) : null}
            <Button type="submit">{t("feedback.submit")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
