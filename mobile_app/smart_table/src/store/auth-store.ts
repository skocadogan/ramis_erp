// ============================================================
// Smart Table — Auth Store
// JWT token, server URL, user info management with SecureStore
// Şube/masa seçimi: useTableStore (tek kaynak)
// ============================================================

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { setCachedToken, setCachedRefreshToken } from "@/services/api-tokens";

const STORAGE_KEYS = {
  SERVER_URL: "smart_table_server_url",
  AUTH_TOKEN: "smart_table_auth_token",
  REFRESH_TOKEN: "smart_table_refresh_token",
  AUTH_USER: "smart_table_auth_user",
  SAVED_SERVERS: "smart_table_saved_servers",
} as const;

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  branch_id?: string;
  branch_name?: string;
}

export interface SavedServer {
  url: string;
  username: string;
  /** @deprecated Şifre saklanmaz; geriye dönük JSON'dan strip edilir */
  password?: string;
  label?: string;
}

function sanitizeSavedServers(raw: unknown): SavedServer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object",
    )
    .map((entry) => ({
      url: String(entry.url ?? ""),
      username: String(entry.username ?? ""),
      label: typeof entry.label === "string" ? entry.label : undefined,
    }))
    .filter((entry) => entry.url.length > 0);
}

interface AuthState {
  serverUrl: string | null;
  token: string | null;
  refreshToken: string | null;
  persistSession: boolean;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  savedServers: SavedServer[];

  init: () => Promise<void>;
  login: (
    serverUrl: string,
    token: string,
    refreshToken: string,
    user: AuthUser,
    persist?: boolean,
  ) => Promise<void>;
  logout: () => Promise<void>;
  saveServer: (server: SavedServer) => Promise<void>;
  removeSavedServer: (url: string) => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
  validateConnection: () => Promise<boolean>;
  setTokens: (access: string, refresh: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  serverUrl: null,
  token: null,
  refreshToken: null,
  persistSession: false,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  savedServers: [],

  init: async () => {
    try {
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("SecureStore timeout")), 5000),
      );

      const result = await Promise.race([
        Promise.all([
          SecureStore.getItemAsync(STORAGE_KEYS.SERVER_URL),
          SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN),
          SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
          SecureStore.getItemAsync(STORAGE_KEYS.AUTH_USER),
          SecureStore.getItemAsync(STORAGE_KEYS.SAVED_SERVERS),
        ]),
        timeoutPromise,
      ]);

      if (!result) {
        set({ isLoading: false });
        return;
      }

      const [serverUrl, token, refreshToken, userStr, savedStr] = result;
      const parsedSaved = savedStr ? JSON.parse(savedStr) : [];
      const savedServers = sanitizeSavedServers(parsedSaved);
      // Eski kayıtlardan şifreleri diske yazmadan temizle
      if (savedStr && JSON.stringify(savedServers) !== savedStr) {
        try {
          await SecureStore.setItemAsync(
            STORAGE_KEYS.SAVED_SERVERS,
            JSON.stringify(savedServers),
          );
        } catch {
          /* non-critical */
        }
      }

      if (token && userStr && serverUrl) {
        const user: AuthUser = JSON.parse(userStr);
        setCachedToken(token);
        if (refreshToken) setCachedRefreshToken(refreshToken);
        set({
          serverUrl,
          token,
          refreshToken,
          persistSession: true,
          user,
          isAuthenticated: true,
          isLoading: false,
          savedServers,
        });
      } else {
        set({ isLoading: false, savedServers, serverUrl: serverUrl ?? null });
      }

      const { useTableStore } = await import("./table-store");
      await useTableStore.getState().init();
    } catch (err) {
      console.warn("[AuthStore] init error:", err);
      set({ isLoading: false });
    }
  },

  login: async (serverUrl, token, refreshToken, user, persist = true) => {
    if (persist) {
      await Promise.all([
        SecureStore.setItemAsync(STORAGE_KEYS.SERVER_URL, serverUrl),
        SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token),
        SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refreshToken),
        SecureStore.setItemAsync(STORAGE_KEYS.AUTH_USER, JSON.stringify(user)),
      ]);
    } else {
      await Promise.all([
        SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN),
        SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
        SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_USER),
      ]);
    }
    setCachedToken(token);
    setCachedRefreshToken(refreshToken);
    set({
      serverUrl,
      token,
      refreshToken,
      persistSession: persist,
      user,
      isAuthenticated: true,
    });

    try {
      const { useTableStore } = await import("./table-store");
      await useTableStore.getState().init();

      const persistedTable = useTableStore.getState().selectedTable;
      if (persistedTable?.id) {
        const { useCartStore } = await import("./cart-store");
        useCartStore.getState().setTable(persistedTable.id);
        const { useOrderStore } = await import("./order-store");
        useOrderStore.setState({ resolvedTableId: persistedTable.id });
      }
    } catch (err) {
      console.warn("[AuthStore] post-login table sync error:", err);
    }
  },

  logout: async () => {
    const { serverUrl } = get();

    try {
      await Promise.all([
        SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN),
        SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
        SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_USER),
      ]);
    } catch (err) {
      console.warn("[AuthStore] logout SecureStore error:", err);
    }

    setCachedToken(null);
    setCachedRefreshToken(null);
    set({
      serverUrl,
      token: null,
      refreshToken: null,
      persistSession: false,
      user: null,
      isAuthenticated: false,
    });

    try {
      const { useCartStore } = await import("./cart-store");
      useCartStore.getState().clearCart();
    } catch (err) {
      console.warn("[AuthStore] logout cart clear error:", err);
    }
    try {
      const { useOrderStore } = await import("./order-store");
      useOrderStore.getState().clearOrders("other");
      useOrderStore.setState({ resolvedTableId: null });
    } catch (err) {
      console.warn("[AuthStore] logout order clear error:", err);
    }
  },

  saveServer: async (server: SavedServer) => {
    const savedServers = get().savedServers;
    const sanitized: SavedServer = {
      url: server.url,
      username: server.username,
      label: server.label,
    };
    const filtered = savedServers.filter((s) => s.url !== sanitized.url);
    const updated = [sanitized, ...filtered].slice(0, 10);

    await SecureStore.setItemAsync(
      STORAGE_KEYS.SAVED_SERVERS,
      JSON.stringify(updated),
    );
    set({ savedServers: updated });
  },

  removeSavedServer: async (url: string) => {
    const updated = get().savedServers.filter((s) => s.url !== url);
    await SecureStore.setItemAsync(
      STORAGE_KEYS.SAVED_SERVERS,
      JSON.stringify(updated),
    );
    set({ savedServers: updated });
  },

  setServerUrl: async (url: string) => {
    const previous = get().serverUrl;
    await SecureStore.setItemAsync(STORAGE_KEYS.SERVER_URL, url);
    set({ serverUrl: url });
    // URL değişince eski JWT'yi kullanma — oturumu düşür
    if (previous && previous !== url && get().isAuthenticated) {
      await get().logout();
    }
  },

  validateConnection: async () => {
    const { serverUrl, token } = get();
    if (!serverUrl || !token) return false;

    try {
      const response = await fetch(`${serverUrl}/api/v1/auth/me/`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  setTokens: async (access: string, refresh: string) => {
    setCachedToken(access);
    setCachedRefreshToken(refresh);
    set({ token: access, refreshToken: refresh });
    if (!get().persistSession) {
      return;
    }
    try {
      await Promise.all([
        SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, access),
        SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refresh),
      ]);
    } catch (err) {
      console.warn("[AuthStore] setTokens SecureStore error:", err);
    }
  },
}));
