// ============================================================
// Stock Man — Offline mutation bridge (P5)
//
// Thin adapter over `executeOrEnqueue` that normalises the
// `{ kind: "live" | "queued" }` shape into a union React Query
// mutationFns can return directly:
//
//   - `{ live: T }` on success
//   - `{ queued: true, mutation_id }` when enqueued offline
//
// Callers use `unwrapOfflineMutation()` (or `createOfflineMutationFn`)
// to flatten `{ live }` into bare `T` for mutation results.
// ============================================================

import {
  executeOrEnqueue,
  type ExecuteOrEnqueueOptions,
} from "./executeOrEnqueue";
import type { UUID } from "@/types";
import { generateUuid } from "@/utils/uuid";

export type OfflineQueuedSentinel = { queued: true; mutation_id: UUID };

export type OfflineAwareMutationResult<T> = T | OfflineQueuedSentinel;

export function isOfflineQueued<T>(
  value: OfflineAwareMutationResult<T>
): value is OfflineQueuedSentinel {
  return (
    typeof value === "object" &&
    value !== null &&
    "queued" in value &&
    (value as OfflineQueuedSentinel).queued === true
  );
}

async function runOfflineAwareMutation<T>(
  opts: ExecuteOrEnqueueOptions
): Promise<{ live: T } | OfflineQueuedSentinel> {
  const idempotencyKey = opts.idempotencyKey ?? generateUuid();
  const result = await executeOrEnqueue<T>({ ...opts, idempotencyKey });
  if (result.kind === "queued") {
    return { queued: true, mutation_id: result.mutation_id };
  }
  return { live: result.data };
}

/** Flatten `runOfflineAwareMutation` into a mutationFn return value. */
export async function unwrapOfflineMutation<T>(
  opts: ExecuteOrEnqueueOptions
): Promise<OfflineAwareMutationResult<T>> {
  const result = await runOfflineAwareMutation<T>(opts);
  if ("live" in result) return result.live;
  return result;
}
