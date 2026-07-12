// ============================================================
// Customer-facing order status — Smart Table Siparişlerim
// Maps KDS / mutfak / garson akışını müşteri diline çevirir.
// ============================================================

import type { Order, OrderItem } from "@/types";

export type CustomerOrderDisplayStatus =
  | "SENT_TO_KITCHEN"
  | "PREPARING"
  | "PREPARED"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

export function getDisplayOrderItems(items: OrderItem[]): OrderItem[] {
  return items.filter((item) => !item.parentItemId);
}

function activeItems(items: OrderItem[]): OrderItem[] {
  return getDisplayOrderItems(items).filter(
    (item) => item.status !== "CANCELLED",
  );
}

export function countDeliveredItems(items: OrderItem[]): number {
  return getDisplayOrderItems(items).filter(
    (item) => item.status === "DELIVERED",
  ).length;
}

export function countActiveItems(items: OrderItem[]): number {
  return activeItems(items).length;
}

/**
 * Müşteri ekranında gösterilecek sipariş durumunu kalemlerden türetir.
 */
export function deriveCustomerOrderDisplayStatus(
  order: Order,
): CustomerOrderDisplayStatus {
  if (order.status === "CANCELLED") return "CANCELLED";
  if (order.status === "COMPLETED") return "COMPLETED";

  const items = activeItems(order.items);
  if (items.length === 0) {
    if (order.status === "DELIVERED") return "DELIVERED";
    if (order.status === "READY") return "PREPARED";
    if (order.status === "PREPARING") return "PREPARING";
    return "SENT_TO_KITCHEN";
  }

  const total = items.length;
  const pendingCount = items.filter((i) => i.status === "PENDING").length;
  const preparingCount = items.filter((i) => i.status === "PREPARING").length;
  const readyCount = items.filter((i) => i.status === "READY").length;
  const deliveredCount = items.filter((i) => i.status === "DELIVERED").length;

  if (deliveredCount === total) return "DELIVERED";
  if (deliveredCount > 0) return "ON_THE_WAY";

  if (readyCount === total) {
    const allAcknowledged = items.every((i) => Boolean(i.waiterAcknowledgedAt));
    return allAcknowledged ? "ON_THE_WAY" : "PREPARED";
  }

  if (preparingCount > 0 || readyCount > 0) return "PREPARING";
  if (pendingCount === total) return "SENT_TO_KITCHEN";

  return "PREPARING";
}

export function deriveCustomerItemDisplayStatus(
  item: OrderItem,
): CustomerOrderDisplayStatus {
  if (item.status === "CANCELLED") return "CANCELLED";
  if (item.status === "DELIVERED") return "DELIVERED";
  if (item.status === "PREPARING") return "PREPARING";
  if (item.status === "PENDING") return "SENT_TO_KITCHEN";
  if (item.status === "READY") {
    return item.waiterAcknowledgedAt ? "ON_THE_WAY" : "PREPARED";
  }
  return "SENT_TO_KITCHEN";
}

export function getCustomerStatusProgressPercent(
  display: CustomerOrderDisplayStatus,
): number {
  const steps: CustomerOrderDisplayStatus[] = [
    "SENT_TO_KITCHEN",
    "PREPARING",
    "PREPARED",
    "ON_THE_WAY",
    "DELIVERED",
  ];
  if (display === "CANCELLED") return 0;
  if (display === "COMPLETED") return 100;
  const idx = steps.indexOf(display);
  if (idx === -1) return 0;
  return Math.round((idx / (steps.length - 1)) * 100);
}
