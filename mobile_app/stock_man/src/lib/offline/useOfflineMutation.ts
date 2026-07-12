// ============================================================
// Stock Man — useOfflineMutation helpers (P5)
//
// Factory helpers for React Query `mutationFn` values that route
// through `executeOrEnqueue`. Each call generates a fresh
// idempotency key so double-taps don't duplicate server work.
//
// Usage in a hook:
//
//   mutationFn: createOfflineMutationFn<Entity, Payload>((payload) => ({
//     endpoint: "/warehouse/foo/",
//     method: "POST",
//     payload,
//     feature: "foo",
//     description: "Create foo",
//   })),
//   onSuccess: (data) => {
//     if (isOfflineQueued(data)) return;
//     invalidate(data.id);
//   },
// ============================================================

import { generateUuid } from "@/utils/uuid";
import type { ExecuteOrEnqueueOptions } from "./executeOrEnqueue";
import {
  isOfflineQueued,
  unwrapOfflineMutation,
  type OfflineAwareMutationResult,
} from "./mutationBridge";

export { isOfflineQueued };
export type { OfflineAwareMutationResult };

/** Standard toast when a mutation was enqueued for later sync. */
export function showOfflineQueuedToast(
  toast: { info: (title: string) => void },
  t: (key: string) => string
): void {
  toast.info(t("offline.queued"));
}

type OfflineMutationOpts = Omit<ExecuteOrEnqueueOptions, "idempotencyKey">;

/**
 * Build a React Query `mutationFn` that accepts variables and
 * returns live data or an offline queued sentinel.
 */
export function createOfflineMutationFn<T, V>(
  buildOpts: (variables: V) => OfflineMutationOpts
): (variables: V) => Promise<OfflineAwareMutationResult<T>> {
  return async (variables: V) =>
    unwrapOfflineMutation<T>({
      ...buildOpts(variables),
      idempotencyKey: generateUuid(),
    });
}
