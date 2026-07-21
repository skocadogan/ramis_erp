// ============================================================
// Smart Table — API Client
// Dynamic base URL from auth store, JWT auth via memory cache.
// Retry on transient errors (502/503/504), health integration.
// Pattern: mobile_app/waiter/src/api/client.ts
// ============================================================

import { useAuthStore } from "@/store/auth-store";
import { useBackendHealthStore } from "@/store/useBackendHealthStore";
import { tokenState } from "./api-tokens";

// ─── Types ──────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Skip transient error retry */
  skipRetry?: boolean;
  /** Internal: marks this request has already attempted a token refresh */
  _retried?: boolean;
}

export interface ApiPostOptions {
  headers?: Record<string, string>;
  skipRetry?: boolean;
}

// ─── Token Cache — tanımlar api-tokens.ts içinde, import yukarıda ──

function getCachedRefreshToken(): string | null {
  if (tokenState.refresh) return tokenState.refresh;
  tokenState.refresh = useAuthStore.getState().refreshToken;
  return tokenState.refresh;
}

// ─── Dynamic Base URL ───────────────────────────────────────

function getApiPrefix(): string {
  const serverUrl = useAuthStore.getState().serverUrl;
  if (!serverUrl) return "";
  return `${serverUrl}/api/v1`;
}

function getToken(): string | null {
  if (tokenState.access) return tokenState.access;
  tokenState.access = useAuthStore.getState().token;
  return tokenState.access;
}

// ─── Retry & Health Helpers ─────────────────────────────────

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const AUTH_REFRESH_TIMEOUT_MS = 5_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Attempt to refresh the access token using the cached refresh token.
 * Deduplicates concurrent refresh attempts — multiple 401s trigger
 * a single refresh call; all waiters share the result.
 * Returns true if refresh succeeded, false otherwise.
 */
export async function attemptTokenRefresh(): Promise<boolean> {
  if (tokenState.refreshPromise) return tokenState.refreshPromise;

  tokenState.refreshPromise = (async () => {
    const state = useAuthStore.getState();
    const refresh = getCachedRefreshToken();
    const serverUrl = state.serverUrl;

    if (!refresh || !serverUrl) return false;

    try {
      const response = await fetchWithTimeout(
        `${serverUrl}/api/v1/auth/token/refresh/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        },
        AUTH_REFRESH_TIMEOUT_MS,
      );

      if (!response.ok) return false;

      const json = await response.json();
      const newAccess: string = json.access;
      const newRefresh: string = json.refresh ?? refresh;

      tokenState.access = newAccess;
      tokenState.refresh = newRefresh;
      await useAuthStore.getState().setTokens(newAccess, newRefresh);
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await tokenState.refreshPromise;
  } finally {
    tokenState.refreshPromise = null;
  }
}

function markBackendHealthOk() {
  useBackendHealthStore.getState().setStatus("ok");
}

function scheduleBackendHealthCheck() {
  void useBackendHealthStore.getState().checkHealth();
}

function shouldRetry(
  status: number,
  path: string,
  skipRetry?: boolean,
): boolean {
  if (skipRetry) return false;
  if (RETRYABLE_STATUSES.has(status)) return true;
  return false;
}

function calcRetryDelay(retryCount: number): number {
  return Math.min(1500 * (retryCount + 1), 5000);
}

// ─── HTTP Client ────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const {
    method = "GET",
    body,
    params,
    skipRetry,
    headers: extraHeaders,
  } = options;
  let retryCount = 0;

  const baseUrl = getApiPrefix();
  if (!baseUrl) {
    return { data: null, error: "Sunucu adresi ayarlanmamış", status: 0 };
  }

  // Build URL with query params
  let url = `${baseUrl}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  while (true) {
    // Build headers (fresh each attempt — token may have changed)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extraHeaders,
    };

    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      if (__DEV__ && path.includes("call-waiter")) {
        console.debug("[API Client] call-waiter URL:", url);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // Başarılı yanıt → health OK
      if (response.ok || response.status === 401 || response.status === 204) {
        markBackendHealthOk();
      }

      // Handle 401 — token expired / invalid
      if (response.status === 401) {
        if (!path.startsWith("/auth/") && !options._retried) {
          options._retried = true;
          const refreshed = await attemptTokenRefresh();
          if (refreshed) continue;
        }

        if (!path.startsWith("/auth/")) {
          tokenState.access = null;
          tokenState.refresh = null;
          tokenState.refreshPromise = null;
          await useAuthStore.getState().logout();
        }
        return {
          data: null,
          error: "Oturum süreniz doldu. Lütfen tekrar giriş yapın.",
          status: 401,
        };
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return { data: null as T, error: null, status: 204 };
      }

      // Retry on transient server errors
      if (
        !response.ok &&
        shouldRetry(response.status, path, skipRetry) &&
        retryCount < MAX_RETRIES
      ) {
        retryCount++;
        await new Promise((r) => setTimeout(r, calcRetryDelay(retryCount)));
        continue;
      }

      const responseText = await response.text();
      let json: unknown = null;
      if (responseText) {
        try {
          json = JSON.parse(responseText);
        } catch {
          json = { detail: responseText };
        }
      }

      if (!response.ok) {
        const errorMsg =
          (json &&
          typeof json === "object" &&
          "detail" in json &&
          (json as { detail?: unknown }).detail != null
            ? String((json as { detail: unknown }).detail)
            : null) ||
          (json &&
          typeof json === "object" &&
          "message" in json &&
          (json as { message?: unknown }).message != null
            ? String((json as { message: unknown }).message)
            : null) ||
          (typeof json === "string" ? json : `HTTP ${response.status}`);
        return { data: null, error: errorMsg, status: response.status };
      }

      return { data: json as T, error: null, status: response.status };
    } catch (err: unknown) {
      // Network error / timeout — health check trigger
      if (!path.includes("/health/")) {
        scheduleBackendHealthCheck();
      }

      // Retry on network errors (except abort/timeout on health endpoints)
      const isTimeout =
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name: string }).name === "AbortError";
      if (
        !skipRetry &&
        !isTimeout &&
        retryCount < MAX_RETRIES &&
        !path.includes("/health/")
      ) {
        retryCount++;
        await new Promise((r) => setTimeout(r, calcRetryDelay(retryCount)));
        continue;
      }

      return {
        data: null,
        error: isTimeout
          ? "İstek zaman aşımına uğradı"
          : err instanceof Error
            ? err.message
            : "Ağ bağlantısı kurulamadı",
        status: 0,
      };
    }
  }
}

// ─── Convenience Methods ────────────────────────────────────

export const api = {
  get: <T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ) => request<T>(path, { method: "GET", params }),

  post: <T>(path: string, body?: unknown, options?: ApiPostOptions) =>
    request<T>(path, { method: "POST", body, ...options }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),

  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
