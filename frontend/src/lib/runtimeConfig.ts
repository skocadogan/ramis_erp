/**
 * Tek kaynak: API tabanı, WebSocket, müşteri ekranı URL'leri ve NEXT_PUBLIC bayrakları.
 *
 * Öncelik:
 * 1. /etc/ramis/runtime-config.json (sunucu) veya /ramis/runtime-config (istemci fetch)
 * 2. Sayfa origin'i ile aynı host (/api/v1) — build-time NEXT_PUBLIC eski IP olsa bile
 * 3. NEXT_PUBLIC_* (yalnızca geliştirme / hostname eşleşiyorsa)
 *
 * node:fs okuması yalnızca runtimeConfig.server.ts içindedir.
 */

import {
  runtimeConfigPayloadSchema,
  type RuntimeConfigPayload,
  type RuntimePublicFlags,
} from "@/lib/runtimeConfigSchema";

export interface AppRuntimeConfig extends RuntimePublicFlags {
  apiBaseUrl: string;
  wsHost: string;
  wsProtocol: "ws:" | "wss:";
  appOrigin: string;
}

let clientCache: AppRuntimeConfig | null = null;

/** SSR snapshot; layout getServerRuntimeConfig() ile doldurulur. */
let requestServerConfig: AppRuntimeConfig | null = null;

const RUNTIME_CONFIG_URL = "/ramis/runtime-config";

function stripTrailingSlash(s: string): string {
  return s.replace(/\/$/, "");
}

function envApiUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_API_URL?.trim();
}

function parseEnvTriState(raw: string | undefined): boolean | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

function resolvePublicFlags(source?: RuntimeConfigPayload | null): RuntimePublicFlags {
  const posOfflineQueue =
    source?.posOfflineQueue ??
    parseEnvTriState(process.env.NEXT_PUBLIC_POS_OFFLINE_QUEUE) ??
    false;

  const apiInterceptorToasts =
    source?.apiInterceptorToasts ??
    parseEnvTriState(process.env.NEXT_PUBLIC_API_INTERCEPTOR_TOASTS) ??
    process.env.NODE_ENV !== "production";

  return { posOfflineQueue, apiInterceptorToasts };
}

function networkFieldsFromApiUrl(
  url: string,
  appOrigin: string
): Pick<AppRuntimeConfig, "apiBaseUrl" | "wsHost" | "wsProtocol" | "appOrigin"> {
  const apiBaseUrl = stripTrailingSlash(url);
  const u = new URL(apiBaseUrl);
  const wsHost = u.host;
  const wsProtocol: "ws:" | "wss:" = u.protocol === "https:" ? "wss:" : "ws:";
  return { apiBaseUrl, wsHost, wsProtocol, appOrigin };
}

function warnMixedContentIfNeeded(cfg: AppRuntimeConfig): void {
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    cfg.wsProtocol === "ws:"
  ) {
    console.warn(
      "[Ramis] Sayfa HTTPS üzerindeyken tarayıcı ws:// WebSocket’lerini engeller (karışık içerik). " +
        "Çözüm: apiBaseUrl değerini https:// (veya aynı origin üzerindeki ters vekil) ile eşleştirin, " +
        "veya geliştirme için arayüzü de http:// üzerinden açın. Nginx kullanıyorsanız wss, /ws/ yoluna yönelmelidir."
    );
  }
}

function buildAppRuntimeConfig(
  apiUrl: string,
  appOrigin: string,
  flagsSource?: RuntimeConfigPayload | null
): AppRuntimeConfig {
  const cfg: AppRuntimeConfig = {
    ...networkFieldsFromApiUrl(apiUrl, appOrigin),
    ...resolvePublicFlags(flagsSource),
  };
  warnMixedContentIfNeeded(cfg);
  return cfg;
}

function sameOriginApiUrl(appOrigin: string): string {
  return `${appOrigin}/api/v1`;
}

function parseHttpOrigin(origin: string): URL | null {
  try {
    return origin ? new URL(origin) : null;
  } catch {
    return null;
  }
}

function isStandardWebPort(port: string): boolean {
  return !port || port === "80" || port === "443";
}

/**
 * Nginx tek-origin kurulum: build sırasında gömülü NEXT_PUBLIC eski IP ise
 * sayfa origin'indeki /api/v1 kullanılır.
 */
function shouldPreferSameOriginApi(appOrigin: string): boolean {
  const page = parseHttpOrigin(appOrigin);
  if (!page || !isStandardWebPort(page.port)) {
    return false;
  }

  const env = envApiUrl();
  if (!env) {
    return true;
  }

  try {
    return new URL(env).hostname !== page.hostname;
  } catch {
    return true;
  }
}

function buildFallbackApiUrl(appOrigin: string): string {
  if (typeof window !== "undefined") {
    const port = window.location.port;
    if (isStandardWebPort(port)) {
      return sameOriginApiUrl(appOrigin);
    }
    return `http://${window.location.hostname}:8000/api/v1`;
  }

  if (appOrigin && shouldPreferSameOriginApi(appOrigin)) {
    return sameOriginApiUrl(appOrigin);
  }

  return "http://127.0.0.1:8000/api/v1";
}

function resolveRuntimeConfig(
  appOrigin: string,
  filePayload?: RuntimeConfigPayload | null,
  allowBuildTimeEnv = true
): AppRuntimeConfig {
  const flagsSource = filePayload ?? null;

  if (filePayload?.apiBaseUrl) {
    return buildAppRuntimeConfig(filePayload.apiBaseUrl, appOrigin, flagsSource);
  }

  if (appOrigin && shouldPreferSameOriginApi(appOrigin)) {
    return buildAppRuntimeConfig(sameOriginApiUrl(appOrigin), appOrigin, flagsSource);
  }

  if (allowBuildTimeEnv) {
    const env = envApiUrl();
    if (env) {
      return buildAppRuntimeConfig(env, appOrigin, flagsSource);
    }
  }

  return buildAppRuntimeConfig(buildFallbackApiUrl(appOrigin), appOrigin, flagsSource);
}

/** Sunucu modülü (runtimeConfig.server.ts) dosyadan okunan payload ile config üretir. */
export function createRuntimeConfig(
  appOrigin: string,
  filePayload?: RuntimeConfigPayload | null,
  options?: { allowBuildTimeEnv?: boolean }
): AppRuntimeConfig {
  const allowBuildTimeEnv =
    options?.allowBuildTimeEnv ??
    (typeof window !== "undefined" || process.env.NODE_ENV === "development");
  return resolveRuntimeConfig(appOrigin, filePayload, allowBuildTimeEnv);
}

/** Root layout SSR: istemci bileşenlerinde getRuntimeConfig() aynı snapshot'ı kullanır. */
export function publishServerRuntimeConfig(cfg: AppRuntimeConfig): void {
  requestServerConfig = cfg;
}

function buildClientRuntimeConfig(): AppRuntimeConfig {
  const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
  return createRuntimeConfig(appOrigin, null);
}

/** İstemci önbelleğini dış dosyadan gelen değerle günceller. */
export function applyClientRuntimeConfig(cfg: AppRuntimeConfig): void {
  clientCache = cfg;
}

/** İstemci: önbellek varsa döner; SSR'da layout snapshot'ı; yoksa akıllı fallback. */
export function getRuntimeConfig(): AppRuntimeConfig {
  if (typeof window === "undefined") {
    if (requestServerConfig) {
      return requestServerConfig;
    }
    return createRuntimeConfig("", null, { allowBuildTimeEnv: process.env.NODE_ENV === "development" });
  }
  if (!clientCache) {
    clientCache = buildClientRuntimeConfig();
  }
  return clientCache;
}

/** İstemci: /ramis/runtime-config okur; başarısızsa SSR snapshot korunur. */
export async function loadClientRuntimeConfig(): Promise<AppRuntimeConfig> {
  const appOrigin = window.location.origin;
  const existing = clientCache;

  try {
    const res = await fetch(RUNTIME_CONFIG_URL, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as unknown;
      const parsed = runtimeConfigPayloadSchema.safeParse(data);
      if (parsed.success) {
        const cfg = buildAppRuntimeConfig(
          parsed.data.apiBaseUrl,
          appOrigin,
          parsed.data
        );
        applyClientRuntimeConfig(cfg);
        return cfg;
      }
    }
  } catch {
    /* ağ hatası — fallback */
  }

  if (existing) {
    return existing;
  }

  const cfg = buildClientRuntimeConfig();
  applyClientRuntimeConfig(cfg);
  return cfg;
}

export function buildPosDisplayPageUrl(
  terminalId: string,
  displayToken?: string,
  branchId?: string | null,
): string {
  const t = terminalId.trim();
  if (!t) return "/pos";
  const enc = encodeURIComponent(t);
  const tok = displayToken?.trim();
  const q = new URLSearchParams({ terminal: t });
  if (tok) q.set("t", tok);
  const bid = branchId?.trim();
  if (bid) q.set("branch_id", bid);
  return `/pos/display/${enc}?${q.toString()}`;
}
