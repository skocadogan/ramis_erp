import axios from "axios";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const DEFAULT_API_URL = Constants.expoConfig?.extra?.apiUrl || "http://localhost:8000/api/v1";

let dynamicBaseURL = DEFAULT_API_URL;

/** Giriş / setApiBaseURL sonrası SecureStore geç yüklemesinin URL'yi ezmesini engeller. */
let baseUrlLockedByUser = false;

/**
 * Bellek içi token cache — her axios isteğinde SecureStore I/O'dan kaçınır.
 * Token değişince (login/logout) `setCachedToken()` ile güncellenir.
 */
let _cachedToken: string | null = null;

export function setCachedToken(token: string | null) {
  _cachedToken = token;
}

export function getCachedToken(): string | null {
  return _cachedToken;
}

// ─── Ready Promise (Race Condition Fix) ──────────────────────────────────────
// İlk isteklerin SecureStore yükleme tamamlanmadan gitmesini engeller.

let _readyResolve: (() => void) | null = null;
const _readyPromise = new Promise<void>((resolve) => {
  _readyResolve = resolve;
});

/** SecureStore yükleme tamamlandığında çağrılır */
function markReady() {
  _readyResolve?.();
  _readyResolve = null;
}

/**
 * SecureStore yükleme tamamlanana kadar bekler.
 * İlk API isteklerinden önce çağrılmalı.
 */
export async function waitForApiReady(): Promise<void> {
  await _readyPromise;
}

const apiClient = axios.create({
  baseURL: dynamicBaseURL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

const RETRYABLE_HTTP_STATUSES = new Set([502, 503, 504]);
const MAX_TRANSIENT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headers: Record<string, unknown> | undefined): number {
  const raw = headers?.["retry-after"];
  const seconds = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  return 2000;
}

/**
 * SecureStore'daki sunucu adresini yalnızca kalıcı oturum varken yükler.
 * `saved_servers` listesi veya giriş formu önizlemesi buraya dokunmaz.
 */
export async function hydrateApiBaseURLFromSecureStore(): Promise<string | null> {
  try {
    const [url, token] = await Promise.all([
      SecureStore.getItemAsync("server_url"),
      SecureStore.getItemAsync("auth_token"),
    ]);
    if (!token || !url || baseUrlLockedByUser) {
      return null;
    }
    dynamicBaseURL = url;
    apiClient.defaults.baseURL = url;
    return url;
  } catch (err) {
    console.warn("Failed to read server_url from SecureStore:", err);
    return null;
  }
}

// Uygulama başlangıcında SecureStore'dan sunucu URL ve token'ı önbelleğe al
Promise.all([hydrateApiBaseURLFromSecureStore(), SecureStore.getItemAsync("auth_token")])
  .then(([, token]) => {
    if (token) _cachedToken = token;
    markReady();
  })
  .catch((err) => {
    console.warn("Failed to load SecureStore values at startup:", err);
    markReady();
  });

export function getApiUrl(): string {
  return dynamicBaseURL;
}

export function setApiBaseURL(url: string) {
  const trimmed = url.trim();
  baseUrlLockedByUser = true;
  dynamicBaseURL = trimmed;
  apiClient.defaults.baseURL = trimmed;
}

export function resetApiBaseURLToDefault() {
  baseUrlLockedByUser = false;
  dynamicBaseURL = DEFAULT_API_URL;
  apiClient.defaults.baseURL = DEFAULT_API_URL;
}

apiClient.interceptors.request.use(async (config) => {
  // İlk isteklerden önce SecureStore yüklemesini bekle
  await _readyPromise;

  // Her istekte güncel dynamicBaseURL'i uygula
  config.baseURL = dynamicBaseURL;

  if (_cachedToken) {
    config.headers.Authorization = `Bearer ${_cachedToken}`;
  }
  return config;
});

let authRedirectInFlight = false;

function markBackendHealthOk() {
  void import("../store/useBackendHealthStore").then(({ useBackendHealthStore }) => {
    useBackendHealthStore.getState().setStatus("ok");
  });
}

function scheduleBackendHealthCheck() {
  void import("../store/useBackendHealthStore").then(({ useBackendHealthStore }) => {
    void useBackendHealthStore.getState().checkHealth();
  });
}

apiClient.interceptors.response.use(
  (res) => {
    markBackendHealthOk();
    return res;
  },
  async (error) => {
    const status = error.response?.status;
    const reqUrl = String(error.config?.url ?? "");
    const config = error.config;

    if (
      config &&
      (RETRYABLE_HTTP_STATUSES.has(status ?? 0) ||
        (!error.response && error.code !== "ECONNABORTED" && !reqUrl.includes("/health/")))
    ) {
      const retryCount = (config._transientRetry as number | undefined) ?? 0;
      if (retryCount < MAX_TRANSIENT_RETRIES) {
        config._transientRetry = retryCount + 1;
        const delayMs = status
          ? parseRetryAfterMs(error.response?.headers as Record<string, unknown>)
          : 1500 * (retryCount + 1);
        await sleep(delayMs);
        return apiClient(config);
      }
    }

    if (!error.response && !reqUrl.includes("/health/")) {
      scheduleBackendHealthCheck();
    }

    if (status === 401 && !reqUrl.includes("/auth/token/") && !reqUrl.includes("/auth/register")) {
      if (!authRedirectInFlight) {
        authRedirectInFlight = true;
        try {
          const { useAuthStore } = await import("../store/useAuthStore");
          await useAuthStore.getState().logout();
        } finally {
          authRedirectInFlight = false;
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
