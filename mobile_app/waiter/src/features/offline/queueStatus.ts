import type { QueueSyncStatus } from "./types";
import { OFFLINE_QUEUE_MAX_RETRIES } from "./config";

/** Non-network sync hata sonrası kuyruk durumu. */
export function resolveNonNetworkQueueStatus(
  retryCount: number,
  httpStatus?: number
): QueueSyncStatus {
  if (retryCount >= OFFLINE_QUEUE_MAX_RETRIES) return "failed";
  if (httpStatus != null && httpStatus >= 500 && httpStatus < 600) return "pending";
  return "failed";
}
