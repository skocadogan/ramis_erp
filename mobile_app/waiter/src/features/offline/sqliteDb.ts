/**
 * SQLite-based offline queue database — CRUD layer.
 *
 * Init and connection management moved to dbInit.ts.
 * Migration path: AsyncStorage → SQLite
 * - First boot: creates tables if not exists
 * - Existing AsyncStorage data can be migrated via migrateFromAsyncStorage()
 */
import { getDatabase, _resetDatabaseForTesting, runSerialized } from "./dbInit";
import type { QueuedOperation, QueueSyncStatus } from "./types";

export { getDatabase, _resetDatabaseForTesting };

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function dbPutOperation(op: QueuedOperation): Promise<void> {
  try {
    await runSerialized(async () => {
      const db = await getDatabase();
      await db.runAsync(
        `INSERT OR REPLACE INTO offline_queue (
        id, client_op_id, type, idempotency_key, endpoint, payload,
        status, retry_count, last_error, created_at, updated_at,
        branch_id, label, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          op.id,
          op.clientOpId,
          op.type,
          op.idempotencyKey,
          op.endpoint,
          JSON.stringify(op.payload),
          op.status,
          op.retryCount,
          op.lastError ?? null,
          op.createdAt,
          op.updatedAt,
          op.branchId,
          op.label,
          op.meta ? JSON.stringify(op.meta) : null,
        ]
      );
    });
  } catch (err) {
    console.warn("[OfflineDB] dbPutOperation error:", err);
  }
}

export async function dbDeleteOperation(id: string): Promise<void> {
  try {
    await runSerialized(async () => {
      const db = await getDatabase();
      await db.runAsync("DELETE FROM offline_queue WHERE id = ?", [id]);
    });
  } catch (err) {
    console.warn("[OfflineDB] dbDeleteOperation error:", err);
  }
}

export async function dbListOperations(): Promise<QueuedOperation[]> {
  try {
    return await runSerialized(async () => {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{
        id: string;
        client_op_id: string;
        type: string;
        idempotency_key: string;
        endpoint: string;
        payload: string;
        status: string;
        retry_count: number;
        last_error: string | null;
        created_at: number;
        updated_at: number;
        branch_id: string;
        label: string;
        meta: string | null;
      }>("SELECT * FROM offline_queue ORDER BY created_at ASC");

      return rows.map(rowToOperation);
    });
  } catch (err) {
    console.warn("[OfflineDB] dbListOperations error:", err);
    return [];
  }
}

export async function dbListByStatuses(statuses: QueueSyncStatus[]): Promise<QueuedOperation[]> {
  if (statuses.length === 0) return [];

  try {
    return await runSerialized(async () => {
      const db = await getDatabase();
      const placeholders = statuses.map(() => "?").join(",");

      const rows = await db.getAllAsync<{
        id: string;
        client_op_id: string;
        type: string;
        idempotency_key: string;
        endpoint: string;
        payload: string;
        status: string;
        retry_count: number;
        last_error: string | null;
        created_at: number;
        updated_at: number;
        branch_id: string;
        label: string;
        meta: string | null;
      }>(
        `SELECT * FROM offline_queue 
       WHERE status IN (${placeholders}) 
       ORDER BY created_at ASC`,
        statuses
      );

      return rows.map(rowToOperation);
    });
  } catch (err) {
    console.warn("[OfflineDB] dbListByStatuses error:", err);
    return [];
  }
}

export async function dbGetQueueCountsAggregated(): Promise<{
  pending: number;
  failed: number;
  conflict: number;
  syncing: number;
  total: number;
}> {
  try {
    return await runSerialized(async () => {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ status: string; cnt: number }>(
        "SELECT status, COUNT(*) AS cnt FROM offline_queue GROUP BY status"
      );
      const counts = {
        pending: 0,
        failed: 0,
        conflict: 0,
        syncing: 0,
        total: 0,
      };
      for (const row of rows) {
        const n = row.cnt ?? 0;
        counts.total += n;
        if (row.status === "pending") counts.pending = n;
        else if (row.status === "failed") counts.failed = n;
        else if (row.status === "conflict") counts.conflict = n;
        else if (row.status === "syncing") counts.syncing = n;
      }
      return counts;
    });
  } catch (err) {
    console.warn("[OfflineDB] dbGetQueueCountsAggregated error:", err);
    return { pending: 0, failed: 0, conflict: 0, syncing: 0, total: 0 };
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function rowToOperation(row: {
  id: string;
  client_op_id: string;
  type: string;
  idempotency_key: string;
  endpoint: string;
  payload: string;
  status: string;
  retry_count: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  branch_id: string;
  label: string;
  meta: string | null;
}): QueuedOperation {
  return {
    id: row.id,
    clientOpId: row.client_op_id,
    type: row.type as QueuedOperation["type"],
    idempotencyKey: row.idempotency_key,
    endpoint: row.endpoint,
    payload: JSON.parse(row.payload),
    status: row.status as QueueSyncStatus,
    retryCount: row.retry_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    branchId: row.branch_id,
    label: row.label,
    meta: row.meta ? JSON.parse(row.meta) : undefined,
  };
}
