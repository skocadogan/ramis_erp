import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { usePosStore } from "./usePosStore";
import { useWaiterPosPushStore } from "./useWaiterPosPushStore";
import { setCachedRefreshToken, setCachedToken } from "../api/client";

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
  login: (user: User, token: string, persist?: boolean, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  init: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
}

const SECURE_KEYS_ON_LOGOUT = [
  "auth_token",
  "auth_refresh_token",
  "auth_user",
  "server_url",
  "delivered_count",
] as const;

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
  login: async (user, token, persist = true, refreshToken) => {
    if (persist) {
      await SecureStore.setItemAsync("auth_token", token);
      await SecureStore.setItemAsync("auth_user", JSON.stringify(user));
      if (refreshToken) {
        await SecureStore.setItemAsync("auth_refresh_token", refreshToken);
      }
    }
    setCachedToken(token);
    setCachedRefreshToken(refreshToken ?? null);
    set({ user, token, isAuthenticated: true });
  },
  logout: async () => {
    if (logoutInProgress) return;
    logoutInProgress = true;

    try {
      // Önce bellek içi oturumu kes — axios/WS eski token ile devam etmesin
      setCachedToken(null);
      setCachedRefreshToken(null);
      set({ user: null, token: null, isAuthenticated: false });

      usePosStore.getState().resetSessionOnLogout();
      useWaiterPosPushStore.getState().resetForLogout();

      const [clientModule, queryModule, offlineModule] = await Promise.allSettled([
        import("../api/client"),
        import("../api/queryClient"),
        import("../features/offline/db"),
      ]);

      if (clientModule.status === "fulfilled") {
        clientModule.value.resetApiBaseURLToDefault();
      }
      if (queryModule.status === "fulfilled") {
        queryModule.value.queryClient.clear();
      }
      if (offlineModule.status === "fulfilled") {
        await offlineModule.value.dbClearAllOperations();
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
      const [token, userStr, storedUrl, refreshToken] = await Promise.all([
        SecureStore.getItemAsync("auth_token"),
        SecureStore.getItemAsync("auth_user"),
        SecureStore.getItemAsync("server_url"),
        SecureStore.getItemAsync("auth_refresh_token"),
      ]);

      if (token && userStr) {
        if (storedUrl) {
          setApiBaseURL(storedUrl);
        }
        setCachedToken(token);
        setCachedRefreshToken(refreshToken);
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
  refreshAccessToken: async () => {
    const { getCachedRefreshToken } = await import("../api/client");
    const refresh =
      getCachedRefreshToken() ?? (await SecureStore.getItemAsync("auth_refresh_token"));
    if (!refresh) return null;

    const { default: apiClient, setCachedToken: cacheAccess } = await import("../api/client");
    const { data } = await apiClient.post<{ access?: string; refresh?: string }>(
      "/auth/token/refresh/",
      { refresh }
    );
    const access = data.access;
    if (!access) return null;

    cacheAccess(access);
    const nextRefresh = data.refresh ?? refresh;
    setCachedRefreshToken(nextRefresh);
    set({ token: access });

    const persistedRefresh = await SecureStore.getItemAsync("auth_refresh_token");
    if (persistedRefresh) {
      await SecureStore.setItemAsync("auth_token", access);
      await SecureStore.setItemAsync("auth_refresh_token", nextRefresh);
    }
    return access;
  },
}));
