import "axios";

declare module "axios" {
  interface AxiosRequestConfig {
    /**
     * true ise bu istek için `api` success/error interceptor toast'ları çalışmaz.
     * Catch içinde ` toastApiError` kullanıyorsanız development'ta çift bildirimi önler.
     */
    skipApiToast?: boolean;
  }
}
