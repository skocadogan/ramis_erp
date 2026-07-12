import { getApiUrl } from "../api/client";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function isLocalBackendHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

let cachedApiUrl: string | null = null;
let cachedOrigin = "";

/** API base URL'den medya sunumu için origin (ör. http://192.168.0.11:8000) */
function getMediaOrigin(apiUrl?: string): string {
  const url = apiUrl ?? getApiUrl();
  if (url === cachedApiUrl) return cachedOrigin;

  cachedApiUrl = url;
  cachedOrigin = stripTrailingSlash(url.split("/api")[0]);
  return cachedOrigin;
}

/**
 * API'den gelen ürün/medya URL'lerini cihazın erişebileceği tam adrese çevirir.
 * Göreli `/media/...` ve localhost mutlak URL'leri destekler.
 */
export function resolveMediaUrl(src: string | null | undefined, apiUrl?: string): string | null {
  if (!src) return null;
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;

  const origin = getMediaOrigin(apiUrl);
  if (!origin) return src;

  if (src.startsWith("/media/")) {
    return `${origin}${src}`;
  }

  if (src.startsWith("http://") || src.startsWith("https://")) {
    try {
      const parsed = new URL(src);
      if (parsed.pathname.startsWith("/media/") && isLocalBackendHost(parsed.hostname)) {
        return `${origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      /* geçersiz URL */
    }
    return src;
  }

  return `${origin}${src.startsWith("/") ? "" : "/"}${src}`;
}
