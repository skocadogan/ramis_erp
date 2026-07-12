// ============================================================
// Stock Man — Offline sync session (P5)
//
// Walks every row in `pending_mutations` and tries to push it
// to the backend. Concurrency model:
//
//   - At most ONE sync session runs at a time. The shared
//     `inFlight` promise is used as a singleton lock; callers
//     that fire `syncPending()` while a sweep is already running
//     just `await` the same promise and get the same result.
//   - If the backend health store says we're `down`, the sweep
//     returns immediately with `{ synced: 0, failed: 0, errors: [] }`
//     so we don't hammer a dead server.
//   - After every row we sleep `RETRY_BACKOFF_MS` to avoid
//     a "stampede" burst the moment the network comes back.
//
// Idempotency:
//   - We forward the row's `idempotency_key` as the
//     `X-Idempotency-Key` header so the backend can dedupe a
//     row that actually made it through during a previous
//     attempt but whose ACK the client missed (timeout on our
//     side, 200 on the server side).
//   - If the server returns 409 + `code=IDEMPOTENCY_CONFLICT` we
//     treat it as success and DELETE the row.
//   - Any other 409 (data conflict) marks the row failed and the
//     sync loop continues — no blocking dialog.
// ============================================================

import { axiosClient } from "@/api/client";
import { extractApiError } from "@/utils/apiError";
import { offlineQueue } from "./queueService";
import type { SyncResult } from "./types";
import { useBackendHealthStore } from "@/store/useBackendHealthStore";

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1500;

let inFlight: Promise<SyncResult> | null = null;

/** True while a sync sweep is currently in progress. */
export function isSyncing(): boolean {
  return inFlight !== null;
}

/**
 * Run a single sync sweep. If a sweep is already in progress,
 * the same in-flight promise is returned — callers do not get
 * a "second" sync, they get a shared handle.
 */
export async function syncPending(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const result: SyncResult = { synced: 0, failed: 0, errors: [] };
    const health = useBackendHealthStore.getState();
    if (health.status === "down") return result;

    let items;
    try {
      items = await offlineQueue.listPending();
    } catch (err) {
      console.warn("[OfflineSync] listPending failed — database unavailable:", err);
      return result;
    }

    for (const item of items) {
      await offlineQueue.markSyncing(item.id);
      try {
        await axiosClient.request({
          url: item.endpoint,
          method: item.method,
          data: item.payload,
          headers: { "X-Idempotency-Key": item.idempotency_key },
          timeout: 10000,
        });
        await offlineQueue.markSynced(item.id);
        result.synced++;
      } catch (e: unknown) {
        const errMsg = extractApiError(e, "Unknown error");
        const code = (e as { response?: { data?: { code?: string } } })?.response
          ?.data?.code;

        const status = (e as { response?: { status?: number } })?.response?.status;
        const errCode = (e as { code?: string })?.code;

        if (status === 409 && code === "IDEMPOTENCY_CONFLICT") {
          // Server says: same key already processed — treat as success.
          await offlineQueue.markSynced(item.id);
          result.synced++;
        } else {
          await offlineQueue.markFailed(item.id, errMsg, MAX_RETRIES);
          result.failed++;
          result.errors.push({ id: item.id, endpoint: item.endpoint, error: errMsg });

          // Ağ hatası veya timeout durumunda döngüyü sonlandırarak sonraki isteklerin
          // gereksiz yere denenmesini ve kuyruğun topluca başarısız olmasını engelliyoruz.
          const isNetworkOrTimeout = !status || errCode === "ERR_NETWORK" || errCode === "ECONNABORTED";
          if (isNetworkOrTimeout) {
            break;
          }
        }
      }
      // Gentle pacing between rows so we don't pin a single TCP socket.
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    }
    return result;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// Re-export type aliases so consumers that already `import` from
// `syncSession` get the canonical names too.
export type {  SyncResult } from "./types";
