import React, { useState } from "react";
import type { User } from "@researchmind/types";
import { Button, Input } from "@researchmind/ui";
import { t } from "@/i18n";

export function ProfileForm({
  user,
  onSave,
}: {
  user: User;
  onSave: (patch: { name: string; email: string }) => Promise<void> | void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave({ name, email });
        setSaving(false);
        setMessage(t("profile.saved"));
      }}
    >
      <Input label={t("settings.profile.name")} value={name} onChange={(e) => setName(e.target.value)} />
      <Input label={t("settings.profile.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="text-xs text-slate-500">{t("profile.plan")}: {user.plan} · {t("profile.verified")}: {user.emailVerified ? t("profile.yes") : t("profile.no")}</div>
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      <Button type="submit" loading={saving}>
        {t("profile.save")}
      </Button>
    </form>
  );
}
