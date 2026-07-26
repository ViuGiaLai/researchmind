import { create } from "zustand";
import type { ActivityItem } from "@researchmind/types";
import { listActivity } from "@/services/activity";

interface ActivityState {
  items: ActivityItem[];
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
}

export const useActivityStore = create<ActivityState>((set) => ({
  items: [],
  loading: false,
  error: null,
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const res = await listActivity();
      set({ items: res.data, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to load activity",
        loading: false,
        items: [],
      });
    }
  },
}));
