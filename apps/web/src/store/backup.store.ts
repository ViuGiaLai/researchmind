import { create } from "zustand";
import type { BackupRecord } from "@researchmind/types";
import { createBackup, listBackups, restoreBackup } from "@/services/backups";

interface BackupState {
  items: BackupRecord[];
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  create: () => Promise<void>;
  restore: (name: string) => Promise<void>;
}

export const useBackupStore = create<BackupState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const res = await listBackups();
      set({ items: res.data, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to load backups",
        loading: false,
        items: [],
      });
    }
  },
  create: async () => {
    const record = await createBackup();
    set({ items: [record, ...get().items] });
  },
  restore: async (name: string) => {
    await restoreBackup(name);
  },
}));
