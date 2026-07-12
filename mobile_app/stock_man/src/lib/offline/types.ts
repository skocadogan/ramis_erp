// ============================================================
// Stock Man — Offline queue types (P5)
//
// Public types for the SQLite-backed mutation queue that
// powers Offline-First mutation flows for purchase orders,
// goods receiving, transfers, stock countings and deficiency
// actions when the warehouse tablet loses connectivity.
//
// All time values are `ms epoch` (matching React Native Date.now())
// to keep the row payload small and human-inspectable in SQLite.
// ============================================================

import type { UUID } from "@/types";

/** HTTP methods we are willing to queue (mirrors the offline spec). */
export type QueuedMutationMethod = "POST" | "PATCH" | "PUT" | "DELETE";

/** Status state-machine for a queued row. */
export type QueuedMutationStatus = "pending" | "syncing" | "failed" | "synced";

/** A single mutation waiting for the backend to come back online. */
export type QueuedMutation = {
  id: UUID;
  /** Backend REST endpoint, e.g. `/purchase/orders/`. */
  endpoint: string;
  method: QueuedMutationMethod;
  /** JSON-serialisable request body. */
  payload: unknown;
  /** Stable key forwarded as `X-Idempotency-Key` so the server can dedupe. */
  idempotency_key: string;
  /**
   * Logical feature bucket (`"purchase-order"`, `"goods-receiving"`,
   * `"transfer"`, `"stock-counting"`, `"deficiency"`, …) used to
   * surface per-feature counts and route notifications.
   */
  feature: string;
  /** Optional human-readable label for in-app history lists. */
  description?: string;
  /** `Date.now()` at enqueue. */
  created_at: number;
  /** Number of failed sync attempts; clamped by `OfflineConfig.maxRetries`. */
  attempts: number;
  /** Last error string surfaced to the user; `undefined` on first enqueue. */
  last_error?: string;
  status: QueuedMutationStatus;
};

/** Result of a single `syncPending()` sweep. */
export type SyncResult = {
  /** Mutations that made it through to the backend. */
  synced: number;
  /** Mutations still queued (either transient-failed or terminal-failed). */
  failed: number;
  /** Per-item error details for the failed bucket. */
  errors: { id: UUID; endpoint: string; error: string }[];
};


