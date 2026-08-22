/** Garson mobil uygulamasında offline kuyruk her zaman etkin. */
const OFFLINE_QUEUE_ENABLED = true;

export const OFFLINE_QUEUE_MAX_RETRIES = 5;
export const OFFLINE_QUEUE_FLUSH_INTERVAL_MS = 15_000;
export const OFFLINE_QUEUE_BASE_BACKOFF_MS = 2_000;
/** Crash/kill sonrası `syncing` satırını yeniden `pending` sayma eşiği. */
export const STALE_SYNCING_MS = 120_000;

export function isOfflineQueueEnabled(): boolean {
  return OFFLINE_QUEUE_ENABLED;
}
