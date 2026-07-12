// ============================================================
// Stock Man — Offline queue service (P5)
//
// Pure data-layer wrapper around the SQLite `pending_mutations`
// table. Exposes an `offlineQueue` object with the minimum set
// of methods the rest of the app needs:
//
//   - enqueue()           : insert a new row (idempotency-key UNIQUE)
//   - listPending()       : rows in {pending, failed} status
//   - count()             : cheap pre-check for badge / modal
//   - markSyncing()       : row claimed by the sync loop
//   - markSynced()        : row gone (we DELETE to keep the table small)
//   - markFailed()        : row stays, `attempts++`, status flips after N tries
//   - clear()             : wipe the table (admin / sign-out)
//
// All timestamps are in `ms epoch`; payload is stored as a
// JSON string. We never store binary blobs — the offline queue
// is intended for small JSON REST payloads only.
// ============================================================

import { withDb } from "./db";
import type {
  QueuedMutation,
  QueuedMutationMethod,
  QueuedMutationStatus,
} from "./types";
import { generateUuid } from "@/utils/uuid";
import type { UUID } from "@/types";

export type EnqueueInput = {
  endpoint: string;
  method: QueuedMutationMethod;
  payload: unknown;
  feature: string;
  description?: string;
  /** Optional override; defaults to a fresh UUID. */
  idempotencyKey?: string;
};

export const offlineQueue = {
  /**
   * Persist a new pending mutation. The `idempotency_key` is
   * UNIQUE in the schema, so calling `enqueue()` twice with the
   * same key (e.g. the user double-taps "submit") is a no-op
   * on the SQLite side — but the *caller* is responsible for
   * deduping on the client. We don't catch the UNIQUE error
   * here; the throws will surface to the mutation hook which
   * can then show a toast.
   */
  async enqueue(input: EnqueueInput): Promise<QueuedMutation> {
    const item: QueuedMutation = {
      id: generateUuid(),
      endpoint: input.endpoint,
      method: input.method,
      payload: input.payload,
      idempotency_key: input.idempotencyKey ?? generateUuid(),
      feature: input.feature,
      description: input.description,
      created_at: Date.now(),
      attempts: 0,
      status: "pending",
    };
    await withDb(async (db) => {
      await db.runAsync(
      `INSERT INTO pending_mutations (id, endpoint, method, payload, idempotency_key, feature, description, created_at, attempts, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.endpoint,
        item.method,
        JSON.stringify(item.payload),
        item.idempotency_key,
        item.feature,
        item.description ?? null,
        item.created_at,
        item.attempts,
        item.status,
      ]
      );
    });
    return item;
  },

  /** Return all rows eligible for the next sync sweep. */
  async listPending(): Promise<QueuedMutation[]> {
    return withDb(async (db) => {
      const rows = await db.getAllAsync<RawRow>(
        `SELECT * FROM pending_mutations WHERE status IN ('pending','failed') ORDER BY created_at ASC`
      );
      return rows.map(rowToMutation);
    });
  },

  /** Number of rows that still need to hit the backend. */
  async count(): Promise<number> {
    return withDb(async (db) => {
      const row = await db.getFirstAsync<{ c: number }>(
        `SELECT COUNT(*) as c FROM pending_mutations WHERE status IN ('pending','failed')`
      );
      return row?.c ?? 0;
    });
  },

  /** Claim a row for syncing. Best-effort; race conditions are tolerated
   *  because the sync loop is single-in-flight via `syncSession`. */
  async markSyncing(id: UUID): Promise<void> {
    await withDb(async (db) => {
      await db.runAsync(`UPDATE pending_mutations SET status='syncing' WHERE id=?`, [id]);
    });
  },

  /** Mark a row fully synced — we hard-delete to keep the table lean. */
  async markSynced(id: UUID): Promise<void> {
    await withDb(async (db) => {
      await db.runAsync(`DELETE FROM pending_mutations WHERE id=?`, [id]);
    });
  },

  /**
   * Increment the attempt counter and either keep the row in
   * `pending` (will retry) or flip it to `failed` (terminal) once
   * the per-row retry budget is exhausted. `last_error` is shown
   * verbatim in the queue inspection UI.
   */
  async markFailed(id: UUID, error: string, maxRetries: number): Promise<void> {
    await withDb(async (db) => {
      const row = await db.getFirstAsync<{ attempts: number }>(
        `SELECT attempts FROM pending_mutations WHERE id=?`,
        [id]
      );
      const attempts = (row?.attempts ?? 0) + 1;
      const status: QueuedMutationStatus = attempts >= maxRetries ? "failed" : "pending";
      await db.runAsync(
        `UPDATE pending_mutations SET attempts=?, last_error=?, status=? WHERE id=?`,
        [attempts, error, status, id]
      );
    });
  },

  /** Wipe the table — used on logout (admin) and by tests. */
  async clear(): Promise<void> {
    await withDb(async (db) => {
      await db.execAsync(`DELETE FROM pending_mutations`);
    });
  },
};

// ─── Row → Type mapping ─────────────────────────────────────

/** SQLite row shape. `status` and `method` are widened to `string`
 *  because SQLite has no enums; we re-narrow in `rowToMutation`. */
type RawRow = {
  id: string;
  endpoint: string;
  method: string;
  payload: string;
  idempotency_key: string;
  feature: string;
  description: string | null;
  created_at: number;
  attempts: number;
  last_error: string | null;
  status: string;
};

function rowToMutation(row: RawRow): QueuedMutation {
  return {
    id: row.id,
    endpoint: row.endpoint,
    method: row.method as QueuedMutationMethod,
    payload: JSON.parse(row.payload),
    idempotency_key: row.idempotency_key,
    feature: row.feature,
    description: row.description ?? undefined,
    created_at: row.created_at,
    attempts: row.attempts,
    last_error: row.last_error ?? undefined,
    status: row.status as QueuedMutationStatus,
  };
}
