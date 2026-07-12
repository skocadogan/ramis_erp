// ============================================================
// Stock Man — API client
//
// Axios instance with dynamic baseURL + in-memory JWT cache.
// Token I/O is intentionally lazy: SecureStore is touched once
// at app boot (`useAuthStore.init`) and on login/logout, then
// every request just reads from a module-level variable.
//
// This keeps request handlers fast and avoids hammering the
// platform keystore.
// ============================================================

import { create, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
const DEFAULT_API_URL = extra?.apiUrl ?? "http://localhost:8000/api/v1";

let dynamicBaseURL = DEFAULT_API_URL;
let _cachedToken: string | null = null;

export function getApiBaseURL(): string {
  return dynamicBaseURL;
}

export function setApiBaseURL(url: string): void {
  dynamicBaseURL = url.replace(/\/+$/, "");
}

export function resetApiBaseURLToDefault(): void {
  dynamicBaseURL = DEFAULT_API_URL;
}

export function getCachedToken(): string | null {
  return _cachedToken;
}

export function setCachedToken(token: string | null): void {
  _cachedToken = token;
}

type SuccessCallback = () => void;
type AuthFailureCallback = () => Promise<void>;
type RefreshTokenCallback = () => Promise<string | null>;

let _onSuccess: SuccessCallback | null = null;
let _onAuthFailure: AuthFailureCallback | null = null;
let _onRefreshToken: RefreshTokenCallback | null = null;

export function registerApiCallbacks(callbacks: {
  onSuccess?: SuccessCallback;
  onAuthFailure?: AuthFailureCallback;
  onRefreshToken?: RefreshTokenCallback;
}) {
  if (callbacks.onSuccess) _onSuccess = callbacks.onSuccess;
  if (callbacks.onAuthFailure) _onAuthFailure = callbacks.onAuthFailure;
  if (callbacks.onRefreshToken) _onRefreshToken = callbacks.onRefreshToken;
}

export const axiosClient: AxiosInstance = create({
  baseURL: DEFAULT_API_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

axiosClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Always apply the latest baseURL — the auth flow mutates it
  // before the first authenticated request, so we don't rely on
  // the constructor value.
  config.baseURL = dynamicBaseURL;
  if (_cachedToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${_cachedToken}`;
  }
  return config;
});

interface QueuePromise {
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueuePromise[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

axiosClient.interceptors.response.use(
  (res) => {
    _onSuccess?.();
    return res;
  },
  async (err) => {
    const status = err?.response?.status;
    const originalRequest = err?.config;

    if (status === 401 && originalRequest && !originalRequest._retry) {
      // Don't refresh token if the request was to the auth token endpoints
      if (originalRequest.url && (originalRequest.url.includes("/auth/token/") || originalRequest.url.includes("/auth/token/refresh/"))) {
        return Promise.reject(err);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axiosClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const handleRefreshFailure = async (refreshErr: unknown) => {
        processQueue(refreshErr, null);
        isRefreshing = false;

        if (_onAuthFailure) {
          try {
            await _onAuthFailure();
          } catch {
            console.warn("[API Client] auth failure callback error");
          }
        }
        return Promise.reject(refreshErr);
      };

      try {
        if (!_onRefreshToken) {
          return handleRefreshFailure(new Error("No refresh token handler registered"));
        }
        const newAccessToken = await _onRefreshToken();
        if (newAccessToken) {
          setCachedToken(newAccessToken);
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          processQueue(null, newAccessToken);
          isRefreshing = false;
          return axiosClient(originalRequest);
        }
        return handleRefreshFailure(new Error("Token refresh returned no access token"));
      } catch (refreshErr) {
        return handleRefreshFailure(refreshErr);
      }
    }
    return Promise.reject(err);
  }
);
