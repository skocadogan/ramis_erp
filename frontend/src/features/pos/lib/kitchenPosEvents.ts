/**
 * Mutfak WS olaylarından POS ready-list / masa HTTP yedek kararları.
 * Backend: `broadcast_kds_refresh` → `orders_updated` (+ consumer’da kds_refresh alias).
 */

const READY_LIST_ITEM_STATUSES = new Set(["READY", "DELIVERED", "SERVED"]);

/** Ready paneli: status change dışında listeyi temizleyen / yenileyen reason’lar. */
const READY_LIST_ORDERS_UPDATED_REASONS = new Set([
  "order_cancelled",
  "cancel_table",
  "complete_table",
  "order_completed",
  "item_cancelled",
  "item_recalled",
  "bulk_status_update",
]);

/**
 * Tam `/tables/` HTTP — yapısal liste değişimi.
 * `item_status` vb. zaten `table_update` ile gelir; full refetch gerekmez.
 */
const TABLES_HTTP_FALLBACK_REASONS = new Set([
  "complete_table",
  "cancel_table",
  "order_created",
  "order_completed",
  "order_cancelled",
]);

export function extractKitchenEventData(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  const message = payload.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    return message as Record<string, unknown>;
  }
  return {};
}

/** POS NotificationDrawer ready-list HTTP tetiklensin mi? */
export function shouldRefreshReadyList(payload: Record<string, unknown>): boolean {
  const type = String(payload.type ?? "");
  const d = extractKitchenEventData(payload);

  if (type === "order_status_changed") {
    const st = String(d.item_status ?? d.status ?? "").toUpperCase();
    return READY_LIST_ITEM_STATUSES.has(st);
  }

  if (
    type === "orders_updated" ||
    type === "kds_refresh" ||
    type === "kds.refresh"
  ) {
    const reason = String(d.reason ?? "");
    return READY_LIST_ORDERS_UPDATED_REASONS.has(reason);
  }

  return false;
}

/** TableSync tam masa listesi HTTP yedeği tetiklensin mi? */
export function shouldHttpFallbackPosTables(
  payload: Record<string, unknown>,
): boolean {
  const type = String(payload.type ?? "");

  // Kalem durumu: `table_update` yeterli.
  if (type === "order_status_changed") {
    return false;
  }

  if (
    type === "orders_updated" ||
    type === "kds_refresh" ||
    type === "kds.refresh"
  ) {
    const d = extractKitchenEventData(payload);
    const reason = String(d.reason ?? "");
    return TABLES_HTTP_FALLBACK_REASONS.has(reason);
  }

  return false;
}
