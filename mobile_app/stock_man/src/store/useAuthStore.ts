// ============================================================
// Stock Man — Auth Store
//
// JWT + user + server URL + saved servers, all persisted via
// expo-secure-store. Pattern lifted from waiter/smart_table,
// stripped to the parts Stock Man actually needs at P0 (no
// branch/table coupling — those are managed by separate stores
// in P1+).
//
// `login()` posts to /auth/token/ then /auth/me/ and normalises
// the response into the `AuthUser` shape the rest of the app
// uses. Anything the API doesn't supply (full_name fallback,
// available_branches, permissions) is read defensively.
// ============================================================

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { axiosClient, setApiBaseURL, setCachedToken } from "@/api/client";
import { extractApiError } from "@/utils/apiError";

const KEY_TOKEN = "stockman_auth_token";
const KEY_REFRESH = "stockman_auth_refresh_token";
const KEY_USER = "stockman_auth_user";
const KEY_SERVER = "stockman_server_url";
const KEY_SAVED_SERVERS = "stockman_saved_servers";
const KEY_LOGIN_HISTORY = "stockman_login_history";
const KEY_BIOMETRIC_CREDS = "stockman_biometric_creds";
const MAX_LOGIN_HISTORY = 50;

type LoginHistoryEntry = {
  timestamp: number;
  username: string;
  serverUrl: string;
};

export type AuthUser = {
  id: string;
  username: string;
  email?: string;
  full_name?: string;
  branch_id?: string | null;
  branch_name?: string | null;
  available_branches?: { id: string; name: string }[];
  permissions?: string[];
};

export type SavedServer = { url: string; username: string; password: string };

type BiometricCredentials = { serverUrl: string; username: string; password: string };

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  serverUrl: string | null;
  savedServers: SavedServer[];
  loginHistory: LoginHistoryEntry[];
  hasBiometricCredentials: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (
    serverUrl: string,
    username: string,
    password: string,
    rememberMe: boolean
  ) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  clearBiometricCredentials: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
  setServerUrl: (url: string) => Promise<void>;
  addSavedServer: (s: SavedServer) => Promise<void>;
  removeSavedServer: (url: string) => Promise<void>;
};

const safeSecureGet = async (key: string): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};
const safeSecureSet = async (key: string, value: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    /* keystore unavailable — ignore */
  }
};
const safeSecureDelete = async (key: string): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* nothing to delete */
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  serverUrl: null,
  savedServers: [],
  loginHistory: [],
  hasBiometricCredentials: false,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  init: async () => {
    set({ isLoading: true });
    const [token, userJson, serverUrl, savedJson, historyJson, biometricJson] = await Promise.all([
      safeSecureGet(KEY_TOKEN),
      safeSecureGet(KEY_USER),
      safeSecureGet(KEY_SERVER),
      safeSecureGet(KEY_SAVED_SERVERS),
      safeSecureGet(KEY_LOGIN_HISTORY),
      safeSecureGet(KEY_BIOMETRIC_CREDS),
    ]);
    let user: AuthUser | null = null;
    if (userJson) {
      try {
        user = JSON.parse(userJson) as AuthUser;
      } catch {
        user = null;
      }
    }
    let savedServers: SavedServer[] = [];
    if (savedJson) {
      try {
        savedServers = JSON.parse(savedJson) as SavedServer[];
      } catch {
        savedServers = [];
      }
    }
    let loginHistory: LoginHistoryEntry[] = [];
    if (historyJson) {
      try {
        loginHistory = JSON.parse(historyJson) as LoginHistoryEntry[];
      } catch {
        loginHistory = [];
      }
    }
    if (token && user && serverUrl) {
      setApiBaseURL(serverUrl);
      setCachedToken(token);
      set({
        user,
        token,
        serverUrl,
        savedServers,
        loginHistory,
        hasBiometricCredentials: !!biometricJson,
        isAuthenticated: true,
        isLoading: false,
      });
      // Hydrate branch store when token is ready
      try {
        const { useBranchStore } = await import("./useBranchStore");
        await useBranchStore.getState().hydrateFromStorage();
        
        // Eagerly fetch branches and warehouses now that token is cached
        const branches = await useBranchStore.getState().fetchBranches();
        const branchStore = useBranchStore.getState();
        const activeBid = branchStore.activeBranchId;
        const activeWid = branchStore.activeWarehouseId;
        if (activeWid && branches.length > 0) {
          const matchingBranch = branches.find((b) => b.id === activeBid);
          const branchId = matchingBranch?.id ?? branches[0]?.id;
          if (branchId) {
            void branchStore.fetchWarehouses(branchId);
          }
        }
      } catch {
        console.warn("[AuthStore] init: branch hydrate error");
      }
    } else {
      set({
        user: null,
        token: null,
        serverUrl: serverUrl ?? null,
        savedServers,
        loginHistory,
        hasBiometricCredentials: !!biometricJson,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  login: async (serverUrl, username, password, rememberMe) => {
    set({ isLoading: true, error: null });
    const formatted = serverUrl.replace(/\/+$/, "");
    setApiBaseURL(formatted);
    try {
      const tokenRes = await axiosClient.post<{ access: string; refresh: string }>(
        "/auth/token/",
        { username, password }
      );
      const token = tokenRes.data.access;
      const refresh = tokenRes.data.refresh;
      setCachedToken(token);

      const meRes = await axiosClient.get<any>("/auth/me/");
      const raw = meRes.data;
      const user: AuthUser = {
        id: raw.id,
        username: raw.username,
        email: raw.email,
        full_name: raw.full_name ?? raw.first_name,
        branch_id: raw.branch?.id ?? raw.branch_id ?? null,
        branch_name: raw.branch?.name ?? null,
        available_branches: raw.available_branches ?? raw.branches ?? [],
        permissions: raw.all_permissions ?? raw.permissions ?? raw.user_permissions ?? [],
      };

      await safeSecureSet(KEY_TOKEN, token);
      await safeSecureSet(KEY_REFRESH, refresh);
      await safeSecureSet(KEY_USER, JSON.stringify(user));
      if (rememberMe) {
        await safeSecureSet(KEY_SERVER, formatted);
        await get().addSavedServer({ url: formatted, username, password });
      }

      // Record successful login in history (last 50 entries).
      const entry: LoginHistoryEntry = {
        timestamp: Date.now(),
        username,
        serverUrl: formatted,
      };
      const prev = get().loginHistory;
      const next = [entry, ...prev].slice(0, MAX_LOGIN_HISTORY);
      await safeSecureSet(KEY_LOGIN_HISTORY, JSON.stringify(next));

      // Her başarılı girişte biyometrik kredi bilgilerini güncelle
      const biometricCreds: BiometricCredentials = { serverUrl: formatted, username, password };
      await safeSecureSet(KEY_BIOMETRIC_CREDS, JSON.stringify(biometricCreds));

      set({
        user,
        token,
        serverUrl: formatted,
        loginHistory: next,
        hasBiometricCredentials: true,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      // Hydrate branches on successful login
      try {
        const { useBranchStore } = await import("./useBranchStore");
        await useBranchStore.getState().hydrateFromStorage();
        const branches = await useBranchStore.getState().fetchBranches();
        const branchStore = useBranchStore.getState();
        const activeBid = branchStore.activeBranchId;
        if (activeBid && branches.length > 0) {
          void branchStore.fetchWarehouses(activeBid);
        }
      } catch {
        console.warn("[AuthStore] login: branch hydrate error");
      }
    } catch (e: unknown) {
      const msg = extractApiError(e, "Login failed");
      set({ isLoading: false, error: msg });
      throw new Error(msg);
    }
  },

  loginWithBiometrics: async () => {
    const raw = await safeSecureGet(KEY_BIOMETRIC_CREDS);
    if (!raw) {
      throw new Error("No biometric credentials saved");
    }
    let creds: BiometricCredentials;
    try {
      creds = JSON.parse(raw) as BiometricCredentials;
    } catch {
      throw new Error("Invalid biometric credentials");
    }
    if (!creds.serverUrl || !creds.username || !creds.password) {
      throw new Error("Incomplete biometric credentials");
    }
    await get().login(creds.serverUrl, creds.username, creds.password, true);
  },

  clearBiometricCredentials: async () => {
    await safeSecureDelete(KEY_BIOMETRIC_CREDS);
    set({ hasBiometricCredentials: false });
  },

  logout: async () => {
    setCachedToken(null);
    await Promise.all([
      safeSecureDelete(KEY_TOKEN),
      safeSecureDelete(KEY_REFRESH),
      safeSecureDelete(KEY_USER),
    ]);

    // Complete cleanup of other stores and queue
    try {
      const [{ useBranchStore }, { useWSPushStore }, { offlineQueue }] = await Promise.all([
        import("./useBranchStore"),
        import("./useWSPushStore"),
        import("@/lib/offline/queueService"),
      ]);
      await useBranchStore.getState().clear();
      useWSPushStore.getState().clearRecent();
      useWSPushStore.getState().clearLowAlerts();
      await offlineQueue.clear();
    } catch {
      console.warn("[AuthStore] logout: cleanup error");
    }

    set({ user: null, token: null, isAuthenticated: false });
  },

  refreshToken: async () => {
    const refresh = await safeSecureGet(KEY_REFRESH);
    if (!refresh) throw new Error("No refresh token available");

    try {
      const res = await axiosClient.post<{ access: string }>("/auth/token/refresh/", {
        refresh,
      });
      const token = res.data.access;
      setCachedToken(token);
      await safeSecureSet(KEY_TOKEN, token);
      set({ token });
      return token;
    } catch (e: any) {
      throw e;
    }
  },

  setServerUrl: async (url) => {
    const formatted = url.replace(/\/+$/, "");
    setApiBaseURL(formatted);
    await safeSecureSet(KEY_SERVER, formatted);
    set({ serverUrl: formatted });
  },

  addSavedServer: async (s) => {
    const cur = get().savedServers.filter((x) => x.url !== s.url);
    const next = [s, ...cur].slice(0, 10);
    await safeSecureSet(KEY_SAVED_SERVERS, JSON.stringify(next));
    set({ savedServers: next });
  },

  removeSavedServer: async (url) => {
    const next = get().savedServers.filter((s) => s.url !== url);
    await safeSecureSet(KEY_SAVED_SERVERS, JSON.stringify(next));
    set({ savedServers: next });
  },
}));
