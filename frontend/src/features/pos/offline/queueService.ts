import { v4 as uuidv4 } from "uuid";
import api from "@/lib/api";
import { dispatchReceiptPrints } from "@/features/pos/lib/dispatchReceiptPrints";
import { buildPrintJobIdempotencyKey } from "@/features/pos/lib/printIdempotency";
import {
  OFFLINE_QUEUE_BASE_BACKOFF_MS,
  OFFLINE_QUEUE_MAX_RETRIES,
} from "./config";
import {
  dbDeleteOperation,
  dbListOperations,
  dbPutOperation,
} from "./db";
import type {
  IdempotentOrderResponse,
  QueuedOperation,
  QueuedOperationType,
  QueueCounts,
  QueueSyncStatus,
} from "./types";

type QueueListener = () => void;

const listeners = new Set<QueueListener>();
let flushInFlight = false;

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

function buildIdempotencyKey(type: QueuedOperationType, clientOpId: string): string {
  const prefix =
    type === "CREATE_ORDER"
      ? "pos:create"
      : type === "COMPLETE_ORDER"
        ? "pos:complete"
        : "pos:complete-table";
  return `${prefix}:${clientOpId}`;
}

export function unwrapOrderResponse(data: IdempotentOrderResponse): IdempotentOrderResponse {
  if (data.order) return data.order;
  return data;
}

export async function getQueueCounts(): Promise<QueueCounts> {
  const ops = await dbListOperations();
  const counts: QueueCounts = { pending: 0, failed: 0, conflict: 0, syncing: 0, total: ops.length };
  for (const op of ops) {
    if (op.status === "pending") counts.pending += 1;
    else if (op.status === "failed") counts.failed += 1;
    else if (op.status === "conflict") counts.conflict += 1;
    else if (op.status === "syncing") counts.syncing += 1;
  }
  return counts;
}

export async function listActiveQueueOperations(): Promise<QueuedOperation[]> {
  const ops = await dbListOperations();
  return ops.filter((o) => o.status !== "synced");
}

export async function hasPendingQueueOperations(): Promise<boolean> {
  const ops = await dbListOperations();
  return ops.some((o) => ["pending", "syncing", "failed", "conflict"].includes(o.status));
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
  const clientOpId = input.clientOpId ?? uuidv4();
  const op: QueuedOperation = {
    id: uuidv4(),
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

async function runDeferredPrints(op: QueuedOperation) {
  const jobs = op.meta?.deferredPrints;
  if (!jobs?.length) return;
  await dispatchReceiptPrints(
    jobs.map((job) => ({
      templateSlug: job.templateSlug,
      printerId: job.printerId,
      context: job.context,
      idempotencyKey: job.idempotencyKey,
    })),
    {
      getPrinterErrorMessage: (id) => `Yazıcı kuyruğu oluşturulamadı: ${id}`,
    }
  );
}

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; response?: unknown };
  if (e.code === "ERR_NETWORK" || e.code === "ECONNABORTED") return true;
  if (!e.response && typeof e.message === "string") {
    return e.message.toLowerCase().includes("network");
  }
  return false;
}

async function syncOneOperation(op: QueuedOperation): Promise<QueuedOperation> {
  const syncing: QueuedOperation = { ...op, status: "syncing", updatedAt: Date.now() };
  await dbPutOperation(syncing);
  notify();

  try {
    const { data } = await api.post<IdempotentOrderResponse>(op.endpoint, op.payload, {
      headers: { "Idempotency-Key": op.idempotencyKey },
    });
    const orderData = unwrapOrderResponse(data);
    const orderId = orderData.id;
    if (orderId && op.meta?.deferredPrints?.length) {
      await dispatchReceiptPrints(
        op.meta.deferredPrints.map((job) => ({
          templateSlug: job.templateSlug,
          printerId: job.printerId,
          context: {
            ...job.context,
            order_number: orderData.order_number ?? job.context.order_number,
          },
          idempotencyKey: buildPrintJobIdempotencyKey(
            orderId,
            job.printerId,
            job.templateSlug
          ),
        })),
        {
          getPrinterErrorMessage: (id) => `Yazıcı kuyruğu oluşturulamadı: ${id}`,
        }
      );
    } else {
      await runDeferredPrints(op);
    }
    await dbDeleteOperation(op.id);
    notify();
    return { ...op, status: "synced" };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number; data?: { code?: string } } })?.response
      ?.status;
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
    const message =
      (err as { response?: { data?: { detail?: string; error?: string } } })?.response?.data
        ?.detail ??
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      (err as Error)?.message ??
      "Sync failed";

    let nextStatus: QueueSyncStatus = "failed";
    if (status === 409 && (code === "IDEMPOTENCY_CONFLICT" || code === "IDEMPOTENCY_SCOPE_MISMATCH")) {
      nextStatus = "conflict";
    } else if (isNetworkError(err)) {
      nextStatus = "pending";
    }

    const retryCount = op.retryCount + 1;
    if (nextStatus === "failed" && retryCount >= OFFLINE_QUEUE_MAX_RETRIES) {
      nextStatus = "failed";
    } else if (nextStatus === "pending" && retryCount >= OFFLINE_QUEUE_MAX_RETRIES) {
      nextStatus = "failed";
    }

    const updated: QueuedOperation = {
      ...op,
      status: nextStatus,
      retryCount,
      lastError: String(message),
      updatedAt: Date.now(),
    };
    await dbPutOperation(updated);
    notify();
    return updated;
  }
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
    const pending = ops.filter((o) => o.status === "pending" || o.status === "failed");
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
      const result = await syncOneOperation(op);
      if (result.status === "synced") synced += 1;

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
    notify();
  }
}

export async function retryQueueOperation(id: string): Promise<void> {
  const ops = await dbListOperations();
  const op = ops.find((o) => o.id === id);
  if (!op) return;
  const reset: QueuedOperation = {
    ...op,
    status: "pending",
    retryCount: 0,
    lastError: null,
    updatedAt: Date.now(),
  };
  await dbPutOperation(reset);
  notify();
  await flushOfflineQueue();
}

export async function discardQueueOperation(id: string): Promise<void> {
  await dbDeleteOperation(id);
  notify();
}

export async function reconcileWithServer(keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    const { data } = await api.post<{ results: Array<{ idempotency_key: string; status: string }> }>(
      "/orders/main/sync/reconcile/",
      { idempotency_keys: keys }
    );
    const found = new Set(
      (data.results ?? []).filter((r) => r.status === "found").map((r) => r.idempotency_key)
    );
    const ops = await dbListOperations();
    for (const op of ops) {
      if (found.has(op.idempotencyKey)) {
        await dbDeleteOperation(op.id);
      }
    }
    notify();
  } catch {
    /* reconcile best-effort */
  }
}
