import { create } from "zustand";
import type { Workspace } from "@researchmind/types";
import { listWorkspaces } from "@/services/workspace";

interface WorkspaceState {
  items: Workspace[];
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  items: [],
  loading: false,
  error: null,
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const res = await listWorkspaces();
      set({ items: res.data, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to load workspaces",
        loading: false,
        items: [],
      });
    }
  },
}));
