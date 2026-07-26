import { create } from "zustand";
import type { UserSettings } from "@researchmind/types";
import { getSettings, updateSettings } from "@/services/settings";

const LOCALE_KEY = "rm_locale";

interface SettingsState {
  settings: UserSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  save: (patch: Partial<UserSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, getState) => ({
  settings: null,
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const settings = await getSettings();
      set({ settings, loading: false });
    } catch {
      // Backend unavailable (CORS / offline) — keep defaults
      set({ loading: false });
    }
  },
  save: async (patch) => {
    // Persist locale to localStorage for unauthenticated public pages
    if (patch.locale) {
      try { localStorage.setItem(LOCALE_KEY, patch.locale); } catch { /* noop */ }
    }
    // Optimistic update: apply to local store immediately
    const prev = getState().settings;
    const optimistic = { ...prev, ...patch } as UserSettings;
    set({ settings: optimistic });

    // Background sync to backend — swallow errors (CORS, offline, etc.)
    try {
      await updateSettings(patch);
    } catch {
      // Backend unavailable — local state is already updated
    }
  },
}));
