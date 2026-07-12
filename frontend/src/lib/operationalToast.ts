"use client";

import { toast } from "sonner";
import { extractApiError } from "@/lib/api-utils";

/**
 * `skipInterceptorToast` — aynı istekte catch içinde `toastApiError` kullanırken
 * development'ta interceptor'ın ikinci kez toast basmasını önler.
 *
 * @example
 *   import api, { skipInterceptorToast } from "@/lib/api";
 *   try {
 *     await api.post("/orders/", body, { ...skipInterceptorToast });
 *   } catch (e) {
 *     toastApiError(e, "Sipariş gönderilemedi.");
 *   }
 */
;

/** Toast dışında (inline hata metni vb.) aynı mesaj çıkarımı — `toastApiError` ile eşlenik. */
export { extractApiError } from "./api-utils";

/**
 * Bilinçli kullanıcı geri bildirimi — production dahil her ortamda gösterilir.
 * Axios interceptor production'da zaten kapalıdır; development'ta aynı hata için
 * önce `{ ...skipInterceptorToast }` verin ki çift bildirim olmasın.
 */
export function toastApiError(err: unknown, fallback: string): void {
  toast.error(extractApiError(err, fallback));
}

/**
 * İşlem başarısı — response gövdesine bağlı kalmadan bilinçli mesaj.
 * Başarıda da backend `message` ile interceptor dev'de toast basıyorsa `skipInterceptorToast` kullanın.
 */
export function toastApiSuccess(message: string): void {
  toast.success(message);
}
