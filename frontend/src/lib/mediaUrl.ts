import { getRuntimeConfig } from "@/lib/runtimeConfig";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

/** Medya dosyaları Nginx üzerinden sayfa origin'inde sunulur (/media/). */
function mediaPublicOrigin(): string {
  if (typeof window !== "undefined" && window.location.origin) {
    return stripTrailingSlash(window.location.origin);
  }
  const cfg = getRuntimeConfig();
  if (cfg.appOrigin) {
    return stripTrailingSlash(cfg.appOrigin);
  }
  return stripTrailingSlash(cfg.apiBaseUrl.replace(/\/api\/v1\/?$/, ""));
}

function isLocalBackendHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

/**
 * API'den gelen ürün/medya URL'lerini tarayıcının erişebildiği public origin'e çevirir.
 * Göreli `/media/...` path'leri ve localhost:8000 mutlak URL'leri destekler.
 */
export function resolveMediaUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;

  const origin = mediaPublicOrigin();

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

  return src;
}
