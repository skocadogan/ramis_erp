export type QueuedOperationType = "CREATE_ORDER" | "COMPLETE_ORDER" | "COMPLETE_TABLE";

export type QueueSyncStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict";

export type DeferredPrintJob = {
  templateSlug: string;
  printerId: string;
  context: Record<string, unknown>;
  idempotencyKey: string;
};

export type QueuedOperation = {
  id: string;
  clientOpId: string;
  type: QueuedOperationType;
  idempotencyKey: string;
  endpoint: string;
  payload: Record<string, unknown>;
  status: QueueSyncStatus;
  retryCount: number;
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
  branchId: string;
  label: string;
  meta?: {
    skipStationStockCheck?: boolean;
    deferredPrints?: DeferredPrintJob[];
    tableName?: string;
  };
};

export type QueueCounts = {
  pending: number;
  failed: number;
  conflict: number;
  syncing: number;
  total: number;
};

export type IdempotentOrderResponse = {
  status?: "created" | "already_processed";
  idempotency_key?: string;
  order?: Record<string, unknown> & { id?: string; order_number?: string };
  sale_id?: string | null;
  completed_count?: number;
  order_ids?: string[];
  /** Geriye dönük düz sipariş yanıtı */
  id?: string;
  order_number?: string;
};
