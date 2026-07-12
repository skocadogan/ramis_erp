import { formatDate } from "@/lib/format/date";
import type { Language } from "@/i18n";
import type { PurchaseOrder, PurchaseOrderItem, UUID } from "@/types";

const RETURN_CANCEL_PO_STATUSES = new Set([
  "APPROVED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
]);

export function findPoLine(
  po: PurchaseOrder,
  stockItemId: UUID
): PurchaseOrderItem | undefined {
  return po.items?.find((it) => String(it.stock_item) === String(stockItemId));
}

function poContainsStockItem(po: PurchaseOrder, stockItemId: UUID): boolean {
  return (po.items ?? []).some((it) => String(it.stock_item) === String(stockItemId));
}

export function filterReturnCancelPurchaseOrders(
  orders: PurchaseOrder[],
  stockItemId: UUID
): PurchaseOrder[] {
  return orders.filter(
    (po) => RETURN_CANCEL_PO_STATUSES.has(po.status) && poContainsStockItem(po, stockItemId)
  );
}

export function formatReturnCancelPoOption(
  po: PurchaseOrder,
  stockItemId: UUID,
  locale: Language = "tr"
): string {
  const line = findPoLine(po, stockItemId);
  const parts = [po.order_number];
  if (po.order_date) {
    parts.push(formatDate(po.order_date, locale));
  }
  if (po.supplier_name) {
    parts.push(po.supplier_name);
  }
  if (line?.unit_price != null) {
    parts.push(String(line.unit_price));
  }
  return parts.join(" · ");
}
