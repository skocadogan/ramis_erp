import "server-only";

import { headers } from "next/headers";
import { readRuntimeConfigFileSync } from "@/lib/readRuntimeConfigFile";
import type { RuntimeConfigPayload } from "@/lib/runtimeConfigSchema";
import {
  createRuntimeConfig,
  publishServerRuntimeConfig,
  type AppRuntimeConfig,
} from "@/lib/runtimeConfig";

type ServerRuntimeCache = {
  appOrigin: string;
  config: AppRuntimeConfig;
};

let serverRuntimeConfigCache: ServerRuntimeCache | null = null;

/** İstek Host / X-Forwarded-* başlıklarından sayfa kök URL'si. */
export async function resolveAppOriginFromRequestHeaders(): Promise<string> {
  const h = await headers();
  const host =
    h.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    h.get("host")?.split(",")[0]?.trim() ??
    "";
  if (!host) {
    return "";
  }
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return `${proto}://${host}`;
}

/** SSR / Node: runtime-config.json → istek origin /api/v1 (build-time NEXT_PUBLIC atlanır). */
export function getServerRuntimeConfig(appOrigin = ""): AppRuntimeConfig {
  if (serverRuntimeConfigCache?.appOrigin === appOrigin) {
    return serverRuntimeConfigCache.config;
  }

  const filePayload = readRuntimeConfigFileSync();
  const config = createRuntimeConfig(appOrigin, filePayload, {
    allowBuildTimeEnv: process.env.NODE_ENV === "development",
  });
  serverRuntimeConfigCache = { appOrigin, config };
  publishServerRuntimeConfig(config);
  return config;
}

/** HTTP route: istemci fetch için payload. */
export function getRuntimeConfigPayloadForClient(
  appOrigin: string
): RuntimeConfigPayload | null {
  const filePayload = readRuntimeConfigFileSync();
  if (filePayload?.apiBaseUrl) {
    return filePayload;
  }

  const cfg = createRuntimeConfig(appOrigin, filePayload, {
    allowBuildTimeEnv: process.env.NODE_ENV === "development",
  });
  if (!cfg.apiBaseUrl) {
    return null;
  }

  return {
    apiBaseUrl: cfg.apiBaseUrl,
    posOfflineQueue: cfg.posOfflineQueue,
    apiInterceptorToasts: cfg.apiInterceptorToasts,
  };
}
