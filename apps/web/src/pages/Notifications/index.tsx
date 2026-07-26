import React, { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationList } from "@/components/notification/NotificationList";
import { Tabs } from "@/components/common/Tabs";
import { Button, EmptyState } from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";
import { Bell } from "lucide-react";
import { t, tpl } from "@/i18n";

export default function NotificationsPage() {
  const { notifications, loading, unread, markAll } = useNotifications();
  const [filter, setFilter] = useState("all");
  if (loading) return <Loading />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">{t("notifications.title")}</h2>
          <p className="page-subtitle">{tpl("notifications.unread", { count: unread })}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void markAll()}>
          {t("notifications.markAllRead")}
        </Button>
      </div>
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: "all", label: t("notifications.filter.all") },
          { id: "workspaces", label: t("notifications.filter.workspaces") },
          { id: "team", label: t("notifications.filter.team") },
          { id: "ai", label: t("notifications.filter.ai") },
          { id: "system", label: t("notifications.filter.system") },
          { id: "billing", label: t("notifications.filter.billing") },
        ]}
      />
      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-8 w-8" />}
          title={t("notifications.empty.title")}
          description={t("notifications.empty.description")}
        />
      ) : (
        <NotificationList items={notifications} />
      )}
    </div>
  );
}
