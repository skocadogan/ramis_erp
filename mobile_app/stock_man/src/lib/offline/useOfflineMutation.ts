// ============================================================
// Stock Man — useOfflineMutation helpers (P5)
// ============================================================

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

type OfflineMutationOpts = Omit<ExecuteOrEnqueueOptions, "idempotencyKey"> & {
  /** Stable key — aynı işlem çift tıklamada aynı anahtarı kullanmalı. */
  idempotencyKey?: string;
};

const inFlight = new Map<string, Promise<OfflineAwareMutationResult<unknown>>>();

export function stableIdempotencyKey(opts: {
  feature: string;
  method: string;
  endpoint: string;
  payload: unknown;
}): string {
  let payloadPart = "";
  try {
    payloadPart = JSON.stringify(opts.payload ?? null) ?? "";
  } catch {
    payloadPart = String(opts.payload);
  }
  return `sm:${opts.feature}:${opts.method}:${opts.endpoint}:${payloadPart}`;
}

/**
 * Build a React Query `mutationFn` that accepts variables and
 * returns live data or an offline queued sentinel.
 * Aynı idempotency key için in-flight dedupe uygular.
 */
export function createOfflineMutationFn<T, V>(
  buildOpts: (variables: V) => OfflineMutationOpts
): (variables: V) => Promise<OfflineAwareMutationResult<T>> {
  return async (variables: V) => {
    const built = buildOpts(variables);
    const idempotencyKey =
      built.idempotencyKey ??
      stableIdempotencyKey({
        feature: built.feature,
        method: built.method,
        endpoint: built.endpoint,
        payload: built.payload,
      });

    const existing = inFlight.get(idempotencyKey);
    if (existing) {
      return existing as Promise<OfflineAwareMutationResult<T>>;
    }

    const promise = unwrapOfflineMutation<T>({
      ...built,
      idempotencyKey,
    }).finally(() => {
      inFlight.delete(idempotencyKey);
    }) as Promise<OfflineAwareMutationResult<T>>;

    inFlight.set(
      idempotencyKey,
      promise as Promise<OfflineAwareMutationResult<unknown>>
    );
    return promise;
  };
}
