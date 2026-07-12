import { Appearance } from "react-native";
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Language, ThemeMode } from "@/types";

function resolveInitialTheme(): ThemeMode {
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

const STORAGE_KEY_IDLE_TIMEOUT = "smart_table_idle_timeout";
const STORAGE_KEY_THEME = "smart_table_theme";

interface ToastState {
  id: number;
  visible: boolean;
  message: string;
  type: "success" | "info" | "error";
}

interface UIState {
  language: Language;
  theme: ThemeMode;
  selectedCategoryId: string | null;
  isCartVisible: boolean;
  isWaiterCallModalVisible: boolean;
  activeModal: string | null;
  /** Saniye cinsinden işlem yapılmazsa welcome'a dönme süresi. 0 = devre dışı */
  idleTimeout: number;
  toast: ToastState;
  lastActivity: number;
  isIdleTimerActive: boolean;

  // Actions
  setLanguage: (lang: Language) => void;
  setTheme: (theme: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
  loadTheme: () => Promise<void>;
  setSelectedCategoryId: (id: string | null) => void;
  setCartVisible: (visible: boolean) => void;
  toggleCart: () => void;
  setWaiterCallModalVisible: (visible: boolean) => void;
  setActiveModal: (modal: string | null) => void;
  showToast: (message: string, type?: ToastState["type"]) => void;
  hideToast: () => void;
  setIdleTimeout: (seconds: number) => Promise<void>;
  loadIdleTimeout: () => Promise<void>;
  resetIdleTimer: () => void;
  setIdleTimerActive: (active: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  language: "tr",
  theme: resolveInitialTheme(),
  selectedCategoryId: null,
  isCartVisible: false,
  isWaiterCallModalVisible: false,
  activeModal: null,
  idleTimeout: 300, // varsayılan 5 dk
  toast: { id: 0, visible: false, message: "", type: "info" },
  lastActivity: Date.now(),
  isIdleTimerActive: false,

  setLanguage: (language) => set({ language }),

  setTheme: async (theme) => {
    set({ theme });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY_THEME, theme);
    } catch {
      /* non-critical */
    }
  },

  toggleTheme: async () => {
    const next = get().theme === "light" ? "dark" : "light";
    set({ theme: next });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY_THEME, next);
    } catch {
      /* non-critical */
    }
  },

  loadTheme: async () => {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEY_THEME);
      if (stored === "dark" || stored === "light") {
        set({ theme: stored as ThemeMode });
      }
    } catch {
      /* non-critical */
    }
  },

  setSelectedCategoryId: (id) => set({ selectedCategoryId: id }),

  setCartVisible: (visible) => set({ isCartVisible: visible }),

  toggleCart: () => set({ isCartVisible: !get().isCartVisible }),

  setWaiterCallModalVisible: (visible) =>
    set({ isWaiterCallModalVisible: visible }),

  setActiveModal: (modal) => set({ activeModal: modal }),

  showToast: (message, type = "info") =>
    set((state) => ({
      toast: {
        id: state.toast.id + 1,
        visible: true,
        message,
        type,
      },
    })),
  hideToast: () =>
    set((state) => ({
      toast: { id: state.toast.id, visible: false, message: "", type: "info" },
    })),

  setIdleTimeout: async (seconds: number) => {
    set({ idleTimeout: seconds });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY_IDLE_TIMEOUT, String(seconds));
    } catch {
      /* non-critical */
    }
  },

  loadIdleTimeout: async () => {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEY_IDLE_TIMEOUT);
      if (stored !== null) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= 0) {
          set({ idleTimeout: val });
        }
      }
    } catch {
      /* non-critical */
    }
  },

  resetIdleTimer: () => set({ lastActivity: Date.now() }),
  setIdleTimerActive: (active) => set({ isIdleTimerActive: active }),
}));
