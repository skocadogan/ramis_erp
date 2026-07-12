import { v4 as uuidv4 } from "uuid";
import api, { skipInterceptorToast } from "@/lib/api";
import { isPosOfflineQueueEnabled } from "./config";
import { shouldQueueMutation } from "./connectivity";
import { enqueueOperation, unwrapOrderResponse } from "./queueService";
import type { EnqueueInput } from "./queueService";
import type { IdempotentOrderResponse } from "./types";

export type ExecuteOrEnqueueResult<T = IdempotentOrderResponse> =
  | { mode: "synced"; data: T }
  | { mode: "queued"; clientOpId: string };

export async function executeOrEnqueue<T = IdempotentOrderResponse>(options: {
  offlineMode: boolean;
  type: EnqueueInput["type"];
  endpoint: string;
  payload: Record<string, unknown>;
  branchId: string;
  label: string;
  meta?: EnqueueInput["meta"];
  clientOpId?: string;
  skipApiToast?: boolean;
}): Promise<ExecuteOrEnqueueResult<T>> {
  const clientOpId = options.clientOpId ?? uuidv4();
  const idempotencyKey =
    options.type === "CREATE_ORDER"
      ? `pos:create:${clientOpId}`
      : options.type === "COMPLETE_ORDER"
        ? `pos:complete:${clientOpId}`
        : `pos:complete-table:${clientOpId}`;
  const axiosConfig = {
    headers: { "Idempotency-Key": idempotencyKey },
    ...(options.skipApiToast ? skipInterceptorToast : {}),
  };

  if (!isPosOfflineQueueEnabled()) {
    const { data } = await api.post<T>(options.endpoint, options.payload, axiosConfig);
    return { mode: "synced", data };
  }

  if (options.offlineMode) {
    await enqueueOperation({ ...options, clientOpId });
    return { mode: "queued", clientOpId };
  }

  try {
    const { data } = await api.post<T>(options.endpoint, options.payload, axiosConfig);
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
