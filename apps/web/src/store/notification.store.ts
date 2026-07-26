import { create } from "zustand";
import type { NotificationItem } from "@researchmind/types";
import { listNotifications, markAllRead } from "@/services/notifications";

interface NotificationState {
  items: NotificationItem[];
  loading: boolean;
  fetchAll: () => Promise<void>;
  markAll: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  loading: false,
  fetchAll: async () => {
    set({ loading: true });
    const res = await listNotifications();
    set({ items: res.data, loading: false });
  },
  markAll: async () => {
    await markAllRead();
    set({ items: get().items.map((n) => ({ ...n, read: true })) });
  },
}));
