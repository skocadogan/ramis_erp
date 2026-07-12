/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

/** Derlemede `src/app/serwist/[path]/route.ts` içinde `define` ile enjekte edilir. */
declare const __RAMIS_API_ORIGIN__: string;

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const apiOrigin = typeof __RAMIS_API_ORIGIN__ === "string" ? __RAMIS_API_ORIGIN__.trim() : "";
const apiOriginPrefix =
  apiOrigin.length > 0 ? new RegExp(`^${escapeRegex(apiOrigin)}/`) : undefined;
const runtimeConfigMatcher = /\/(ramis\/runtime-config|runtime-config\.json)$/;

function isApiRequest(url: URL): boolean {
  if (url.pathname.startsWith("/api/")) {
    return true;
  }
  if (apiOriginPrefix) {
    return apiOriginPrefix.test(url.href);
  }
  return false;
}

const runtimeCaching = [
  {
    matcher: ({ url }: { url: URL }) => isApiRequest(url),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ url }: { url: URL }) => runtimeConfigMatcher.test(url.pathname),
    handler: new NetworkOnly(),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  disableDevLogs: true,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
