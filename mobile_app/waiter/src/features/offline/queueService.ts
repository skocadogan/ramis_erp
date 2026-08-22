import apiClient from "../../api/client";
import { OFFLINE_QUEUE_BASE_BACKOFF_MS } from "./config";
import {
  dbDeleteOperation,
  dbGetQueueCountsAggregated,
  dbListOperations,
  dbPutOperation,
} from "./db";
import { buildIdempotencyKey, syncOneOperation } from "./queueExecutor";
import { isQueueError, QueueNetworkError } from "./queueErrors";
import { isFlushableQueueOperation } from "./queueStatus";
import { randomUUID } from "./randomUUID";
import type { QueuedOperation, QueuedOperationType, QueueCounts } from "./types";

type QueueListener = () => void;

const listeners = new Set<QueueListener>();
let flushInFlight = false;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

const NOTIFY_DEBOUNCE_MS = 80;

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    listeners.forEach((listener) => listener());
  }, NOTIFY_DEBOUNCE_MS);
}

function notifyOfflineQueueImmediate() {
  if (notifyTimer) {
    clearTimeout(notifyTimer);
    notifyTimer = null;
  }
  listeners.forEach((listener) => listener());
}

export async function getQueueCounts(): Promise<QueueCounts> {
  return dbGetQueueCountsAggregated();
}

export async function listActiveQueueOperations(): Promise<QueuedOperation[]> {
  const ops = await dbListOperations();
  return ops.filter((op) => op.status !== "synced");
}

export type EnqueueInput = {
  type: QueuedOperationType;
  endpoint: string;
  payload: Record<string, unknown>;
  branchId: string;
  label: string;
  meta?: QueuedOperation["meta"];
  clientOpId?: string;
};

export async function enqueueOperation(input: EnqueueInput): Promise<QueuedOperation> {
  const now = Date.now();
  const clientOpId = input.clientOpId ?? randomUUID();
  const op: QueuedOperation = {
    id: randomUUID(),
    clientOpId,
    type: input.type,
    idempotencyKey: buildIdempotencyKey(input.type, clientOpId),
    endpoint: input.endpoint,
    payload: input.payload,
    status: "pending",
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    branchId: input.branchId,
    label: input.label,
    meta: input.meta,
  };
  await dbPutOperation(op);
  notify();
  return op;
}

export type FlushOfflineQueueOptions = {
  onProgress?: (progress: { total: number; completed: number; currentLabel: string }) => void;
  shouldContinue?: () => boolean;
};

export async function flushOfflineQueue(
  options?: FlushOfflineQueueOptions
): Promise<{ synced: number; remaining: number; aborted: boolean }> {
  if (flushInFlight) {
    return {
      synced: 0,
      remaining: (await listActiveQueueOperations()).length,
      aborted: false,
    };
  }
  flushInFlight = true;
  let synced = 0;
  let aborted = false;
  try {
    const ops = await dbListOperations();
    const pending = ops.filter((op) => isFlushableQueueOperation(op));
    const total = pending.length;

    for (let index = 0; index < pending.length; index += 1) {
      if (options?.shouldContinue && !options.shouldContinue()) {
        aborted = true;
        break;
      }

      const op = pending[index]!;
      options?.onProgress?.({
        total,
        completed: synced,
        currentLabel: op.label,
      });

      if (op.retryCount > 0) {
        const delay = OFFLINE_QUEUE_BASE_BACKOFF_MS * 2 ** Math.min(op.retryCount - 1, 4);
        if (Date.now() - op.updatedAt < delay) continue;
      }

      try {
        await syncOneOperation(op, notify);
        synced += 1;
      } catch (err: unknown) {
        if (isQueueError(err) && err instanceof QueueNetworkError) {
          // Network error — operation stays pending, will retry
          continue;
        }
        // QueueSyncError / QueueConflictError — operation already marked failed/conflict
      }

      if (options?.shouldContinue && !options.shouldContinue()) {
        aborted = true;
        break;
      }
    }

    if (!aborted) {
      options?.onProgress?.({
        total,
        completed: synced,
        currentLabel: "",
      });
    }

    const remaining = (await listActiveQueueOperations()).length;
    return { synced, remaining, aborted };
  } finally {
    flushInFlight = false;
    notifyOfflineQueueImmediate();
  }
}

export async function reconcileWithServer(keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    const { data } = await apiClient.post<{
      results: Array<{ idempotency_key: string; status: string }>;
    }>("/orders/main/sync/reconcile/", { idempotency_keys: keys });
    const found = new Set(
      (data.results ?? []).filter((row) => row.status === "found").map((row) => row.idempotency_key)
    );
    const ops = await dbListOperations();
    for (const op of ops) {
      if (found.has(op.idempotencyKey)) {
        await dbDeleteOperation(op.id);
      }
    }
    notify();
  } catch {
    /* best-effort */
  }
}
