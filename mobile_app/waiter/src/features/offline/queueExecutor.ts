import apiClient from "../../api/client";
import { OFFLINE_QUEUE_MAX_RETRIES } from "./config";
import { dbDeleteOperation, dbPutOperation } from "./db";
import { QueueConflictError, QueueNetworkError, QueueSyncError } from "./queueErrors";
import type {
  IdempotentOrderResponse,
  QueuedOperation,
  QueuedOperationType,
  QueueSyncStatus,
} from "./types";

export function buildIdempotencyKey(type: QueuedOperationType, clientOpId: string): string {
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

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; response?: unknown };
  if (e.code === "ERR_NETWORK" || e.code === "ECONNABORTED") return true;
  if (!e.response && typeof e.message === "string") {
    return e.message.toLowerCase().includes("network");
  }
  return false;
}

async function runDeferredPrints(op: QueuedOperation, orderData: IdempotentOrderResponse) {
  const jobs = op.meta?.deferredPrints;
  if (!jobs?.length) return;

  const orderId = orderData.id;
  for (const job of jobs) {
    try {
      await apiClient.post(`/reporting/receipts/${job.templateSlug}/print_thermal/`, {
        printer_id: job.printerId,
        context: {
          ...job.context,
          ...(orderId ? { order_id: orderId } : {}),
          order_number: orderData.order_number ?? job.context.order_number,
        },
        idempotency_key: job.idempotencyKey,
      });
    } catch (err) {
      console.warn("Deferred print failed:", err);
    }
  }
}

export async function syncOneOperation(
  op: QueuedOperation,
  notifyChange?: () => void
): Promise<QueuedOperation> {
  const notify = notifyChange ?? (() => {});
  const syncing: QueuedOperation = { ...op, status: "syncing", updatedAt: Date.now() };
  await dbPutOperation(syncing);
  notify();

  try {
    const { data } = await apiClient.post<IdempotentOrderResponse>(op.endpoint, op.payload, {
      headers: { "Idempotency-Key": op.idempotencyKey },
    });
    const orderData = unwrapOrderResponse(data);
    await runDeferredPrints(op, orderData);
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

    if (
      status === 409 &&
      (code === "IDEMPOTENCY_CONFLICT" || code === "IDEMPOTENCY_SCOPE_MISMATCH")
    ) {
      const conflictErr = new QueueConflictError(String(message), op.id, err);
      const updated: QueuedOperation = {
        ...op,
        status: "conflict",
        retryCount: op.retryCount + 1,
        lastError: String(message),
        updatedAt: Date.now(),
      };
      await dbPutOperation(updated);
      notify();
      throw conflictErr;
    }

    if (isNetworkError(err)) {
      const netErr = new QueueNetworkError(String(message), op.id, err);
      const retryCount = op.retryCount + 1;
      const finalStatus: QueueSyncStatus =
        retryCount >= OFFLINE_QUEUE_MAX_RETRIES ? "failed" : "pending";
      const updated: QueuedOperation = {
        ...op,
        status: finalStatus,
        retryCount,
        lastError: String(message),
        updatedAt: Date.now(),
      };
      await dbPutOperation(updated);
      notify();
      throw netErr;
    }

    const retryCount = op.retryCount + 1;
    const finalStatus: QueueSyncStatus =
      retryCount >= OFFLINE_QUEUE_MAX_RETRIES ? "failed" : "failed";

    const syncErr = new QueueSyncError(String(message), op.id, err);
    const updated: QueuedOperation = {
      ...op,
      status: finalStatus,
      retryCount,
      lastError: String(message),
      updatedAt: Date.now(),
    };
    await dbPutOperation(updated);
    notify();
    throw syncErr;
  }
}
