import { create } from "zustand";
import type { User } from "@researchmind/types";
import * as authService from "@/services/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  hydrate: () => void;
  setSession: (user: User, token: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  hydrated: false,
  hydrate: () => {
    set({
      user: authService.getStoredUser(),
      token: authService.getToken(),
      hydrated: true,
    });
  },
  setSession: (user, token) => set({ user, token }),
  clear: () => set({ user: null, token: null }),
}));
