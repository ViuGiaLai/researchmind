import { create } from "zustand";
import type { Report } from "@researchmind/types";
import { listReports } from "@/services/reports";

interface ReportState {
  items: Report[];
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
}

export const useReportStore = create<ReportState>((set) => ({
  items: [],
  loading: false,
  error: null,
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const res = await listReports();
      set({ items: res.data, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to load reports",
        loading: false,
        items: [],
      });
    }
  },
}));
