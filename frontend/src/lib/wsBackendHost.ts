import { getRuntimeConfig } from "@/lib/runtimeConfig";

/** WebSocket olayı kaçırıldığında veya bağlantı yokken HTTP ile yenileme (ms). Bildirim çekmecesi vb. */
export const WS_HTTP_FALLBACK_INTERVAL_MS = 60_000;

/**
 * POS / garson masa grid'i: anlık WS tercih; yedek HTTP sıklığı (daha sık — sipariş durumu WS kaçırılınca hissedilir).
 */

/** WebSocket URL parçaları — `runtimeConfig` ile HTTP API ile aynı backend hedefi. */
export function getBackendWsHost(): string {
  return getRuntimeConfig().wsHost;
}

export function getWsProtocol(): "ws:" | "wss:" {
  return getRuntimeConfig().wsProtocol;
}
