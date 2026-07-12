// API'den gelen göreli medya path'lerini mobil cihazın erişebileceği tam URL'ye çevirir.
// Pattern: mobile_app/waiter ProductCard + frontend/src/lib/mediaUrl.ts

import { useAuthStore } from "@/store/auth-store";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function isLocalBackendHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

function getServerUrlFromStore(): string | null {
  return useAuthStore.getState().serverUrl;
}

/** Sunucu kök origin'i (ör. http://192.168.1.10) */
export function getMediaOrigin(serverUrl?: string | null): string {
  const url = serverUrl ?? getServerUrlFromStore();
  if (!url) return "";
  return stripTrailingSlash(url.split("/api")[0]);
}

/**
 * Göreli `/media/...` path'leri ve localhost mutlak URL'lerini çözümler.
 * @param serverUrl Test veya erken yükleme için isteğe bağlı origin kaynağı
 */
export function resolveMediaUrl(
  src: string | null | undefined,
  serverUrl?: string | null,
): string {
  if (!src) return "";
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;

  const origin = getMediaOrigin(serverUrl);
  if (!origin) return src;

  if (src.startsWith("/media/")) {
    return `${origin}${src}`;
  }

  if (src.startsWith("http://") || src.startsWith("https://")) {
    try {
      const parsed = new URL(src);
      if (
        parsed.pathname.startsWith("/media/") &&
        isLocalBackendHost(parsed.hostname)
      ) {
        return `${origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      /* geçersiz URL — olduğu gibi bırak */
    }
    return src;
  }

  return `${origin}${src.startsWith("/") ? "" : "/"}${src}`;
}
