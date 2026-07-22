/**
 * Mutfak WS olaylarından POS ready-list / masa HTTP yedek kararları.
 * Backend: `broadcast_kds_refresh` → `orders_updated` (+ consumer’da kds_refresh alias).
 *
 * Paket (TAKEAWAY) siparişlerin fizik `table_id`’si yoktur; `table_update` gelmez.
 * Sanal kartlar (`tw-ord__*`) yalnız `/tables/takeaway_virtual/` HTTP ile güncellenir.
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
 * Tam `/tables/` (+ takeaway_virtual) HTTP — yapısal liste değişimi.
 * Fizik masada `item_status` çoğu zaman `table_update` ile gelir; paket için gelmez.
 */
const TABLES_HTTP_FALLBACK_REASONS = new Set([
  "complete_table",
  "cancel_table",
  "order_created",
  "order_completed",
  "order_cancelled",
  "item_status",
]);

function reasonsInclude(
  d: Record<string, unknown>,
  allowed: Set<string>,
): boolean {
  const reason = String(d.reason ?? "");
  if (allowed.has(reason)) return true;
  const reasons = d.reasons;
  if (Array.isArray(reasons)) {
    return reasons.some((r) => allowed.has(String(r)));
  }
  return false;
}

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
    if (reasonsInclude(d, READY_LIST_ORDERS_UPDATED_REASONS)) return true;
    // Görüldü / durum invalidasyonu — badge ve listeyi HTTP ile uzlaştır.
    const reason = String(d.reason ?? "");
    if (reason === "item_acknowledged" || reason === "item_status") return true;
    const reasons = d.reasons;
    if (Array.isArray(reasons)) {
      return reasons.some(
        (r) => r === "item_acknowledged" || r === "item_status",
      );
    }
  }

  return false;
}

/** TableSync tam masa listesi HTTP yedeği tetiklensin mi? */
export function shouldHttpFallbackPosTables(
  payload: Record<string, unknown>,
): boolean {
  const type = String(payload.type ?? "");
  const d = extractKitchenEventData(payload);

  if (type === "order_status_changed") {
    // Fizik masa: table_update yeterli. Paket (table_id yok): sanal liste HTTP gerekir.
    return !d.table_id;
  }

  if (
    type === "orders_updated" ||
    type === "kds_refresh" ||
    type === "kds.refresh"
  ) {
    return reasonsInclude(d, TABLES_HTTP_FALLBACK_REASONS);
  }

  return false;
}
