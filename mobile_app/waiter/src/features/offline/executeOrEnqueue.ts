import { isOfflineQueueEnabled } from "./config";
import { shouldQueueMutation } from "./connectivity";
import { enqueueOperation } from "./queueService";
import { unwrapOrderResponse } from "./queueExecutor";
import { randomUUID } from "./randomUUID";
import type { EnqueueInput } from "./queueService";
import type { ExecuteOrEnqueueResult, IdempotentOrderResponse } from "./types";
import apiClient from "../../api/client";

export async function executeOrEnqueue<T = IdempotentOrderResponse>(options: {
  offlineMode: boolean;
  type: EnqueueInput["type"];
  endpoint: string;
  payload: Record<string, unknown>;
  branchId: string;
  label: string;
  meta?: EnqueueInput["meta"];
  clientOpId?: string;
}): Promise<ExecuteOrEnqueueResult<T>> {
  const clientOpId = options.clientOpId ?? randomUUID();
  const idempotencyKey =
    options.type === "CREATE_ORDER"
      ? `pos:create:${clientOpId}`
      : options.type === "COMPLETE_ORDER"
        ? `pos:complete:${clientOpId}`
        : `pos:complete-table:${clientOpId}`;

  if (!isOfflineQueueEnabled()) {
    const { data } = await apiClient.post<T>(options.endpoint, options.payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
    return { mode: "synced", data };
  }

  if (options.offlineMode) {
    await enqueueOperation({ ...options, clientOpId });
    return { mode: "queued", clientOpId };
  }

  try {
    const { data } = await apiClient.post<T>(options.endpoint, options.payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
    return { mode: "synced", data };
  } catch (err) {
    if (shouldQueueMutation(false, err)) {
      await enqueueOperation({ ...options, clientOpId });
      return { mode: "queued", clientOpId };
    }
    throw err;
  }
}

export function extractOrderFromResponse(data: IdempotentOrderResponse): IdempotentOrderResponse {
  return unwrapOrderResponse(data) as IdempotentOrderResponse;
}
