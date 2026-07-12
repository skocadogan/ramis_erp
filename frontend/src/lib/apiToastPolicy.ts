import { getRuntimeConfig } from "@/lib/runtimeConfig";

/**
 * Axios `api` interceptor'ının response gövdelerinden otomatik toast üretmesi.
 *
 * ## Ortam
 * - Varsayılan: yalnızca `NODE_ENV !== "production"` iken açık (geliştirme).
 * - Production'da kapalı; staging'de runtime-config.json veya `NEXT_PUBLIC_API_INTERCEPTOR_TOASTS=true` ile açılabilir.
 *
 * ## Çift toast (development)
 * Catch içinde `toastApiError` kullanıyorsanız aynı isteğe `{ ...skipInterceptorToast }` ekleyin
 * (`@/lib/api` veya `@/lib/operationalToast`). Interceptor o istekte susar; tek mesaj catch'ten gelir.
 *
 * Bileşen içi rastgele `toast.*` çağrıları bu dosyadan bağımsızdır.
 * Production'da kullanıcıya gösterilmesi gereken API hataları için `operationalToast.toastApiError`.
 */
export function shouldToastFromApiInterceptor(): boolean {
  return getRuntimeConfig().apiInterceptorToasts;
}
