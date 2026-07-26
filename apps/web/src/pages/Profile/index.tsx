import React from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { ProfileForm } from "@/components/account/ProfileForm";
import { USER_KEY } from "@/utils/constants";
import { useAuthStore } from "@/store/auth.store";
import { t } from "@/i18n";

export default function ProfilePage() {
  const { user } = useAuthContext();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);

  if (!user) return <p className="text-slate-400">{t("profile.notSignedIn")}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{t("profile.title")}</h2>
        <p className="page-subtitle">{t("profile.subtitle")}</p>
      </div>
      <ProfileForm
        user={user}
        onSave={({ name, email }) => {
          const next = { ...user, name, email, updatedAt: new Date().toISOString() };
          localStorage.setItem(USER_KEY, JSON.stringify(next));
          if (token) setSession(next, token);
        }}
      />
    </div>
  );
}
