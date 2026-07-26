import { useEffect, useRef } from "react";
import { useNotificationStore } from "@/store/notification.store";

export function useNotifications() {
  const items = useNotificationStore((s) => s.items);
  const loading = useNotificationStore((s) => s.loading);
  const fetchAll = useNotificationStore((s) => s.fetchAll);
  const markAll = useNotificationStore((s) => s.markAll);
  const fetched = useRef(false);

  useEffect(() => {
    if (!fetched.current && !items.length && !loading) {
      fetched.current = true;
      void fetchAll();
    }
  }, [items.length, loading, fetchAll]);

  const unread = items.filter((n) => !n.read).length;
  return { notifications: items, loading, unread, refresh: fetchAll, markAll };
}
