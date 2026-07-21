// ============================================================
// Stock Man — Auth Store
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
/** Biometric-gated refresh token (şifre saklanmaz). */
const KEY_BIOMETRIC_REFRESH = "stockman_biometric_refresh";
const KEY_BIOMETRIC_META = "stockman_biometric_meta";
const MAX_LOGIN_HISTORY = 50;

const BIOMETRIC_SECURE_OPTS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: "Authenticate to use saved login",
};

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

/** Şifre saklanmaz — yalnızca URL + kullanıcı adı. */
export type SavedServer = { url: string; username: string };

type BiometricMeta = { serverUrl: string; username: string };

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
const safeSecureSet = async (
  key: string,
  value: string,
  options?: SecureStore.SecureStoreOptions
): Promise<void> => {
  try {
    await SecureStore.setItemAsync(key, value, options);
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

function sanitizeSavedServers(raw: unknown): SavedServer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url.trim() : "";
      const username = typeof o.username === "string" ? o.username.trim() : "";
      if (!url) return null;
      return { url, username };
    })
    .filter(Boolean) as SavedServer[];
}

async function clearSessionSecrets(): Promise<void> {
  await Promise.all([
    safeSecureDelete(KEY_TOKEN),
    safeSecureDelete(KEY_REFRESH),
    safeSecureDelete(KEY_USER),
    safeSecureDelete(KEY_SERVER),
    safeSecureDelete(KEY_BIOMETRIC_REFRESH),
    safeSecureDelete(KEY_BIOMETRIC_META),
    // Legacy plaintext password blob (eski sürümler)
    safeSecureDelete("stockman_biometric_creds"),
  ]);
}

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
    const [token, userJson, serverUrl, savedJson, historyJson, biometricMeta] = await Promise.all([
      safeSecureGet(KEY_TOKEN),
      safeSecureGet(KEY_USER),
      safeSecureGet(KEY_SERVER),
      safeSecureGet(KEY_SAVED_SERVERS),
      safeSecureGet(KEY_LOGIN_HISTORY),
      safeSecureGet(KEY_BIOMETRIC_META),
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
        savedServers = sanitizeSavedServers(JSON.parse(savedJson));
        await safeSecureSet(KEY_SAVED_SERVERS, JSON.stringify(savedServers));
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
    // Eski düz metin biyometrik kaydı temizle
    await safeSecureDelete("stockman_biometric_creds");

    if (token && user && serverUrl) {
      setApiBaseURL(serverUrl);
      setCachedToken(token);
      set({
        user,
        token,
        serverUrl,
        savedServers,
        loginHistory,
        hasBiometricCredentials: !!biometricMeta,
        isAuthenticated: true,
        isLoading: false,
      });
      try {
        const { useBranchStore } = await import("./useBranchStore");
        await useBranchStore.getState().hydrateFromStorage();
        const branches = await useBranchStore.getState().fetchBranches();
        await useBranchStore.getState().reconcileWithAvailableBranches(branches);
        const branchStore = useBranchStore.getState();
        const activeBid = branchStore.activeBranchId;
        if (activeBid && branches.length > 0) {
          void branchStore.fetchWarehouses(activeBid);
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
        hasBiometricCredentials: !!biometricMeta,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  login: async (serverUrl, username, password, rememberMe) => {
    set({ isLoading: true, error: null });
    const formatted = serverUrl.replace(/\/+$/, "");
    if (formatted.startsWith("http://")) {
      console.warn(
        "[AuthStore] HTTP API kullanılıyor. Mümkünse HTTPS tercih edin (LAN dışı MITM riski)."
      );
    }
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

      // Farklı kullanıcıysa offline kuyruğu temizle
      try {
        const { offlineQueue } = await import("@/lib/offline/queueService");
        const prevUserJson = await safeSecureGet(KEY_USER);
        if (prevUserJson) {
          try {
            const prev = JSON.parse(prevUserJson) as AuthUser;
            if (prev.id && prev.id !== user.id) {
              await offlineQueue.clear();
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        console.warn("[AuthStore] login: offline queue user check failed");
      }

      await safeSecureSet(KEY_TOKEN, token);
      await safeSecureSet(KEY_REFRESH, refresh);
      await safeSecureSet(KEY_USER, JSON.stringify(user));
      if (rememberMe) {
        await safeSecureSet(KEY_SERVER, formatted);
        await get().addSavedServer({ url: formatted, username });
        // Biyometrik: yalnızca refresh token (şifre yok), OS kimlik doğrulaması zorunlu
        await safeSecureSet(KEY_BIOMETRIC_REFRESH, refresh, BIOMETRIC_SECURE_OPTS);
        await safeSecureSet(
          KEY_BIOMETRIC_META,
          JSON.stringify({ serverUrl: formatted, username } satisfies BiometricMeta)
        );
      }

      const entry: LoginHistoryEntry = {
        timestamp: Date.now(),
        username,
        serverUrl: formatted,
      };
      const prev = get().loginHistory;
      const next = [entry, ...prev].slice(0, MAX_LOGIN_HISTORY);
      await safeSecureSet(KEY_LOGIN_HISTORY, JSON.stringify(next));

      set({
        user,
        token,
        serverUrl: formatted,
        loginHistory: next,
        hasBiometricCredentials: rememberMe,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      try {
        const { useBranchStore } = await import("./useBranchStore");
        await useBranchStore.getState().hydrateFromStorage();
        const branches = await useBranchStore.getState().fetchBranches();
        await useBranchStore.getState().reconcileWithAvailableBranches(branches);
        const branchStore = useBranchStore.getState();
        const activeBid = branchStore.activeBranchId;
        if (activeBid && branches.length > 0) {
          void branchStore.fetchWarehouses(activeBid);
        }
      } catch {
        console.warn("[AuthStore] login: branch hydrate error");
      }
    } catch (e: unknown) {
      setCachedToken(null);
      const msg = extractApiError(e, "Login failed");
      set({ isLoading: false, error: msg });
      throw new Error(msg);
    }
  },

  loginWithBiometrics: async () => {
    const metaRaw = await safeSecureGet(KEY_BIOMETRIC_META);
    if (!metaRaw) {
      throw new Error("No biometric credentials saved");
    }
    let meta: BiometricMeta;
    try {
      meta = JSON.parse(metaRaw) as BiometricMeta;
    } catch {
      throw new Error("Invalid biometric credentials");
    }
    if (!meta.serverUrl || !meta.username) {
      throw new Error("Incomplete biometric credentials");
    }

    let refresh: string | null = null;
    try {
      refresh = await SecureStore.getItemAsync(KEY_BIOMETRIC_REFRESH, BIOMETRIC_SECURE_OPTS);
    } catch {
      throw new Error("Biometric authentication failed");
    }
    if (!refresh) {
      throw new Error("No biometric credentials saved");
    }

    const formatted = meta.serverUrl.replace(/\/+$/, "");
    setApiBaseURL(formatted);
    set({ isLoading: true, error: null });
    try {
      const res = await axiosClient.post<{ access: string }>("/auth/token/refresh/", {
        refresh,
      });
      const token = res.data.access;
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
      await safeSecureSet(KEY_SERVER, formatted);

      set({
        user,
        token,
        serverUrl: formatted,
        hasBiometricCredentials: true,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      try {
        const { useBranchStore } = await import("./useBranchStore");
        await useBranchStore.getState().hydrateFromStorage();
        const branches = await useBranchStore.getState().fetchBranches();
        await useBranchStore.getState().reconcileWithAvailableBranches(branches);
        const branchStore = useBranchStore.getState();
        if (branchStore.activeBranchId) {
          void branchStore.fetchWarehouses(branchStore.activeBranchId);
        }
      } catch {
        console.warn("[AuthStore] biometric login: branch hydrate error");
      }
    } catch (e: unknown) {
      setCachedToken(null);
      const msg = extractApiError(e, "Login failed");
      set({ isLoading: false, error: msg });
      throw new Error(msg);
    }
  },

  clearBiometricCredentials: async () => {
    await Promise.all([
      safeSecureDelete(KEY_BIOMETRIC_REFRESH),
      safeSecureDelete(KEY_BIOMETRIC_META),
      safeSecureDelete("stockman_biometric_creds"),
    ]);
    set({ hasBiometricCredentials: false });
  },

  logout: async () => {
    setCachedToken(null);
    await clearSessionSecrets();

    try {
      const [
        { useBranchStore },
        { useWSPushStore },
        { offlineQueue },
        { queryClient },
      ] = await Promise.all([
        import("./useBranchStore"),
        import("./useWSPushStore"),
        import("@/lib/offline/queueService"),
        import("@/api/queryClient"),
      ]);
      await useBranchStore.getState().clear();
      useWSPushStore.getState().clearRecent();
      useWSPushStore.getState().clearLowAlerts();
      await offlineQueue.clear();
      queryClient.clear();
    } catch {
      console.warn("[AuthStore] logout: cleanup error");
    }

    set({
      user: null,
      token: null,
      serverUrl: null,
      isAuthenticated: false,
      hasBiometricCredentials: false,
    });
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
    const sanitized = { url: s.url, username: s.username };
    const cur = get().savedServers.filter((x) => x.url !== sanitized.url);
    const next = [sanitized, ...cur].slice(0, 10);
    await safeSecureSet(KEY_SAVED_SERVERS, JSON.stringify(next));
    set({ savedServers: next });
  },

  removeSavedServer: async (url) => {
    const next = get().savedServers.filter((s) => s.url !== url);
    await safeSecureSet(KEY_SAVED_SERVERS, JSON.stringify(next));
    set({ savedServers: next });
  },
}));
