import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { usePosStore } from "./usePosStore";
import { useWaiterPosPushStore } from "./useWaiterPosPushStore";
import { setCachedToken } from "../api/client";

interface User {
  id: string;
  username: string;
  fullName: string;
  role: string;
  branchId: string;
  /** `/auth/me/` branch_name — dashboard’da gösterim */
  branchName?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User, token: string, persist?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  init: () => Promise<void>;
}

const SECURE_KEYS_ON_LOGOUT = ["auth_token", "auth_user", "server_url", "delivered_count"] as const;

async function safeSecureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* anahtar yok veya platform hatası — çıkışı engellemesin */
  }
}

let logoutInProgress = false;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  login: async (user, token, persist = true) => {
    if (persist) {
      await SecureStore.setItemAsync("auth_token", token);
      await SecureStore.setItemAsync("auth_user", JSON.stringify(user));
    }
    setCachedToken(token);
    set({ user, token, isAuthenticated: true });
  },
  logout: async () => {
    if (logoutInProgress) return;
    logoutInProgress = true;

    try {
      // Önce bellek içi oturumu kes — axios/WS eski token ile devam etmesin
      setCachedToken(null);
      set({ user: null, token: null, isAuthenticated: false });

      usePosStore.getState().resetSessionOnLogout();
      useWaiterPosPushStore.getState().resetForLogout();

      const [clientModule, queryModule] = await Promise.allSettled([
        import("../api/client"),
        import("../api/queryClient"),
      ]);

      if (clientModule.status === "fulfilled") {
        clientModule.value.resetApiBaseURLToDefault();
      }
      if (queryModule.status === "fulfilled") {
        queryModule.value.queryClient.clear();
      }

      await Promise.all(SECURE_KEYS_ON_LOGOUT.map(safeSecureDelete));
    } catch (error) {
      console.error("Logout cleanup error:", error);
    } finally {
      logoutInProgress = false;
      try {
        const { router } = await import("expo-router");
        router.replace("/(auth)/login");
      } catch {
        /* navigasyon yoksa (main) layout yönlendirir */
      }
    }
  },
  init: async () => {
    try {
      const { setApiBaseURL } = await import("../api/client");
      const [token, userStr, storedUrl] = await Promise.all([
        SecureStore.getItemAsync("auth_token"),
        SecureStore.getItemAsync("auth_user"),
        SecureStore.getItemAsync("server_url"),
      ]);

      if (token && userStr) {
        if (storedUrl) {
          setApiBaseURL(storedUrl);
        }
        setCachedToken(token);
        set({
          token,
          user: JSON.parse(userStr),
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error("Auth init error:", error);
      set({ isLoading: false });
    }
  },
}));
