import { getRuntimeConfig } from "@/lib/runtimeConfig";

/** EPIC-07: POS offline kuyruk — kontrollü rollout bayrağı */
export function isPosOfflineQueueEnabled(): boolean {
  return getRuntimeConfig().posOfflineQueue;
}

export const OFFLINE_QUEUE_MAX_RETRIES = 5;
export const OFFLINE_QUEUE_FLUSH_INTERVAL_MS = 15_000;
export const OFFLINE_QUEUE_BASE_BACKOFF_MS = 2_000;
