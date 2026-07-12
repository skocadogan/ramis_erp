import axios, { type AxiosRequestConfig } from "axios";
import { getRuntimeConfig } from "@/lib/runtimeConfig";
import { shouldToastFromApiInterceptor } from "@/lib/apiToastPolicy";
import { toast } from "sonner";

// In-memory token cache: sync localStorage reads on every request
// are expensive in POS with hundreds of calls. Use refreshTokenCache()
// to populate this from login/logout flows.
let cachedToken: string | null = null;

// In-memory locale cache: parsed once from document.cookie
let cachedLocale: string | null = null;

/**
 * Read token from localStorage and populate the in-memory cache.
 * Call this after login/logout to keep cachedToken in sync.
 */
export function refreshTokenCache(): void {
  if (typeof window === "undefined") {
    cachedToken = null;
    return;
  }
  try {
    const authData = localStorage.getItem("auth-storage");
    if (authData) {
      const parsed = JSON.parse(authData);
      cachedToken = parsed?.state?.token ?? null;
    } else {
      cachedToken = null;
    }
  } catch {
    cachedToken = null;
  }
}

const api = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  config.baseURL = getRuntimeConfig().apiBaseUrl;

  // Add Authorization header if token exists in localStorage (bypasses dev mode cookie restrictions)
  // We use direct localStorage parsing here to avoid circular imports and Turbopack build hangs
  if (typeof window !== "undefined") {
    let token = cachedToken;
    if (!token) {
      refreshTokenCache();
      token = cachedToken;
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  // i18n: Backend'e aktif dili bildir → Django LocaleMiddleware API mesajlarını
  // doğru dilde döndürür. Cookie yoksa 'tr' varsayılan.
  if (typeof document !== 'undefined') {
    cachedLocale ??= document.cookie
      .split('; ')
      .find((c) => c.startsWith('NEXT_LOCALE='))
      ?.split('=')[1] ?? null;
    if (cachedLocale) {
      config.headers['Accept-Language'] = cachedLocale;
    }
  }

  return config;
});

// --- 401 Response Interceptor: Token expire → otomatik refresh + retry ---
let isRefreshing = false;
let failedQueue: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(undefined);
  });
  failedQueue = [];
};

/** Refresh endpoint'inin 401'i tekrar refresh denemesine sokulmaz; aksi halde sonsuz döngü oluşur. */
function isTokenRefreshRequest(config: { url?: string } | undefined): boolean {
  const u = config?.url ?? "";
  return typeof u === "string" && u.includes("/auth/token/refresh/");
}

/** Catch'te `toastApiError` kullanılan isteklerde spread edin: `api.post(url, body, { ...skipInterceptorToast })` */
export const skipInterceptorToast: Pick<AxiosRequestConfig, "skipApiToast"> = {
  skipApiToast: true,
};

function shouldRunInterceptorToast(
  config: AxiosRequestConfig | undefined
): boolean {
  return (
    shouldToastFromApiInterceptor() && config?.skipApiToast !== true
  );
}

/**
 * Başarı / hata gövdelerinden global toast.
 * Production'da kapalı — bkz. `apiToastPolicy.ts` ve `NEXT_PUBLIC_API_INTERCEPTOR_TOASTS`.
 * Çift toast için `skipInterceptorToast` — bkz. `operationalToast.ts`.
 */
api.interceptors.response.use(
  (response) => {
    const message = response.data?.message || response.data?.detail;
    if (
      shouldRunInterceptorToast(response.config) &&
      message &&
      typeof message === "string"
    ) {
      toast.success(message);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (shouldRunInterceptorToast(originalRequest)) {
      const errorData = error.response?.data;
      if (errorData) {
        const errorMessage =
          errorData.detail || errorData.message || errorData.error;
        if (errorMessage && typeof errorMessage === "string") {
          toast.error(errorMessage);
        } else if (typeof errorData === "object") {
          const firstError = Object.values(errorData)[0];
          if (Array.isArray(firstError) && typeof firstError[0] === "string") {
            toast.error(firstError[0]);
          } else if (typeof firstError === "string") {
            toast.error(firstError);
          }
        }
      } else if (error.message) {
        toast.error(error.message);
      }
    }

    if (error.response?.status === 401 && isTokenRefreshRequest(originalRequest)) {
      if (typeof window !== "undefined") {
        const { useAuthStore } = await import("@/store/useAuthStore");
        useAuthStore.getState().logout();
        window.location.href = "/";
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await api.post("/auth/token/refresh/");
        const newAccess = refreshRes.data?.access as string | undefined;
        if (typeof window !== "undefined" && newAccess) {
          const { useAuthStore } = await import("@/store/useAuthStore");
          useAuthStore.setState((s) => ({ ...s, token: newAccess }));
          // In-memory cache'i de güncelle ki retry'de expired token göndermesin
          cachedToken = newAccess;
        }
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        if (typeof window !== "undefined") {
          const { useAuthStore } = await import("@/store/useAuthStore");
          useAuthStore.getState().logout();
          window.location.href = "/";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
