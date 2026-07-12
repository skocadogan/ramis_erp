// ============================================================
// Smart Table — Order Store Pure Helpers
// ============================================================

import type { Order, OrderItemStatus, OrderStatus } from "@/types";

const TERMINAL_ORDER_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED"];

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

export function deriveOrderStatusFromItems(
  items: { status: OrderItemStatus }[],
  current: OrderStatus,
): OrderStatus {
  if (items.length === 0) return current;
  if (items.every((it) => it.status === "CANCELLED")) return "CANCELLED";
  if (items.some((it) => it.status === "PENDING")) {
    return current === "CONFIRMED" ? "CONFIRMED" : "PENDING";
  }
  if (items.some((it) => it.status === "PREPARING")) return "PREPARING";
  if (
    items.every((it) =>
      ["READY", "DELIVERED", "CANCELLED"].includes(it.status),
    ) &&
    items.some((it) => it.status === "READY")
  ) {
    return "READY";
  }
  if (
    items.every((it) => it.status === "DELIVERED" || it.status === "CANCELLED")
  ) {
    return "DELIVERED";
  }
  return current;
}

export function normalizeActiveOrders(orders: Order[]): Order[] {
  return orders
    .map((o) => {
      if (o.items.length === 0) return o;
      return {
        ...o,
        status: deriveOrderStatusFromItems(o.items, o.status),
      };
    })
    .filter((o) => !isTerminalOrderStatus(o.status));
}
