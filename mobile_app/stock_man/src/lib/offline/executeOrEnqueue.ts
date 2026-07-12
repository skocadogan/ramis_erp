// ============================================================
// Stock Man — executeOrEnqueue helper (P5)
//
// The single entry point feature code should use to write a
// mutation. Behaviour:
//
//   1. If the backend health store says we're `down` — skip
//      the network call and enqueue immediately.
//   2. Otherwise try the live request.
//   3. On a *network* error (no response, ECONNABORTED, ERR_NETWORK)
//      fall through to enqueue and return `{ kind: "queued" }`.
//   4. Any other HTTP error (4xx/5xx with a body) is rethrown
//      so the caller can surface a validation message.
//
// The function never throws for a network failure — that is the
// whole point. It also never throws if the enqueue itself fails;
// in that pathological case it re-throws the SQLite error so we
// don't silently lose the user's data.
// ============================================================

import { axiosClient } from "@/api/client";
import { offlineQueue } from "./queueService";
import type { QueuedMutationMethod } from "./types";
import { useBackendHealthStore } from "@/store/useBackendHealthStore";
import type { UUID } from "@/types";

export type ExecuteOrEnqueueOptions = {
  endpoint: string;
  method: QueuedMutationMethod;
  payload: unknown;
  /** Logical feature bucket (e.g. `"purchase-order"`). */
  feature: string;
  /** User-facing label for the queue inspector UI. */
  description?: string;
  /** If true, skip the live call and always enqueue (used for
   *  flows the caller has explicitly marked as offline-safe). */
  forceEnqueue?: boolean;
  /** Request timeout in ms (default 8000). */
  timeoutMs?: number;
  /** Client-generated idempotency key forwarded as
   *  `X-Idempotency-Key` header. Prevents the server from
   *  processing the same mutation twice when the response is
   *  lost and the client retries (or enqueues). */
  idempotencyKey?: string;
};

export type ExecuteOrEnqueueResult<T> =
  | { kind: "live"; data: T }
  | { kind: "queued"; mutation_id: UUID };

/** Network-level failure detection — no HTTP response at all. */
function isNetworkError(e: any): boolean {
  if (!e) return false;
  if (e.code === "ERR_NETWORK") return true;
  if (e.code === "ECONNABORTED") return true;
  if (!e.response) return true; // axios signals "no response" with no .response
  return false;
}

export async function executeOrEnqueue<T = unknown>(
  opts: ExecuteOrEnqueueOptions
): Promise<ExecuteOrEnqueueResult<T>> {
  const health = useBackendHealthStore.getState();

  if (opts.forceEnqueue || health.status === "down") {
    const item = await offlineQueue.enqueue({
      endpoint: opts.endpoint,
      method: opts.method,
      payload: opts.payload,
      feature: opts.feature,
      description: opts.description,
      idempotencyKey: opts.idempotencyKey,
    });
    return { kind: "queued", mutation_id: item.id };
  }

  try {
    const res = await axiosClient.request<T>({
      url: opts.endpoint,
      method: opts.method,
      data: opts.payload,
      timeout: opts.timeoutMs ?? 8000,
      ...(opts.idempotencyKey
        ? { headers: { "X-Idempotency-Key": opts.idempotencyKey } }
        : {}),
    });
    return { kind: "live", data: res.data };
  } catch (e: any) {
    if (isNetworkError(e)) {
      const item = await offlineQueue.enqueue({
        endpoint: opts.endpoint,
        method: opts.method,
        payload: opts.payload,
        feature: opts.feature,
        description: opts.description,
        idempotencyKey: opts.idempotencyKey,
      });
      return { kind: "queued", mutation_id: item.id };
    }
    throw e;
  }
}
