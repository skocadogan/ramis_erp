import type { QueuedOperation, QueueSyncStatus } from "./types";
import { OFFLINE_QUEUE_MAX_RETRIES, STALE_SYNCING_MS } from "./config";

/** Non-network sync hata sonrası kuyruk durumu. */
export function resolveNonNetworkQueueStatus(
  retryCount: number,
  httpStatus?: number
): QueueSyncStatus {
  if (retryCount >= OFFLINE_QUEUE_MAX_RETRIES) return "failed";
  if (httpStatus != null && httpStatus >= 500 && httpStatus < 600) return "pending";
  return "failed";
}

/** Flush sırasında işlenecek satırlar: pending/failed + takılı kalmış syncing. */
export function isFlushableQueueOperation(op: QueuedOperation, now = Date.now()): boolean {
  if (op.status === "pending" || op.status === "failed") return true;
  return op.status === "syncing" && now - op.updatedAt >= STALE_SYNCING_MS;
}
