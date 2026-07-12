// ============================================================
// Stock Man — UI Store
//
// Lightweight, app-wide UI preferences:
//   - language: persisted, drives `useI18n()`
//   - themePreference: light | dark | system (NativeWind's
//     useColorScheme() reads this through useAppTheme)
//
// Both keys are persisted to SecureStore so the user doesn't
// have to re-pick after every app reinstall on a logged-out
// device. They are NOT cleared on logout (preference is
// independent of session).
// ============================================================

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { Language } from "@/i18n/types";

const KEY_LANG = "stockman_language";
const KEY_THEME = "stockman_theme";

export type ThemePreference = "light" | "dark" | "system";

type UIState = {
  language: Language;
  themePreference: ThemePreference;
  setLanguage: (l: Language) => Promise<void>;
  setThemePreference: (t: ThemePreference) => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
};

export const useUIStore = create<UIState>((set) => ({
  language: "tr",
  themePreference: "system",

  setLanguage: async (l) => {
    set({ language: l });
    try {
      await SecureStore.setItemAsync(KEY_LANG, l);
    } catch {
      /* ignore */
    }
  },

  setThemePreference: async (t) => {
    set({ themePreference: t });
    try {
      await SecureStore.setItemAsync(KEY_THEME, t);
    } catch {
      /* ignore */
    }
  },

  hydrateFromStorage: async () => {
    try {
      const [l, t] = await Promise.all([
        SecureStore.getItemAsync(KEY_LANG),
        SecureStore.getItemAsync(KEY_THEME),
      ]);
      set({
        language: (l as Language) || "tr",
        themePreference: (t as ThemePreference) || "system",
      });
    } catch {
      /* ignore — defaults are already set */
    }
  },
}));
