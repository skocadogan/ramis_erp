// ============================================================
// Smart Table — Order WebSocket Sync Slice
// WS'ten gelen sipariş durum değişikliklerini uygular.
// ============================================================

import type { StateCreator } from "zustand";
import type { Order, OrderItemStatus } from "@/types";
import { useTableStore } from "@/store/table-store";
import {
  isTerminalOrderStatus,
  deriveOrderStatusFromItems,
} from "./orderUtils";
import type { OrderFetchSlice } from "./orderFetchSlice";
import type { WsOrderStatusPayload } from "./types";

export interface OrderWsSlice {
  wsConnected: boolean;

  setWsConnected: (connected: boolean) => void;
  applyWsOrderStatusChange: (payload: WsOrderStatusPayload) => void;
}

function patchOrder(
  order: Order,
  orderId: string,
  itemId: string,
  itemStatus: OrderItemStatus,
  now: string,
): Order {
  if (order.id !== orderId) return order;
  const newItems = order.items.map((it) =>
    it.id === itemId ? { ...it, status: itemStatus } : it,
  );
  const newStatus = deriveOrderStatusFromItems(newItems, order.status);
  return { ...order, items: newItems, status: newStatus, updatedAt: now };
}

export const createOrderWsSlice: StateCreator<
  OrderWsSlice & OrderFetchSlice,
  [],
  [],
  OrderWsSlice
> = (set, get) => ({
  wsConnected: false,

  setWsConnected: (connected) => {
    set({ wsConnected: connected });
  },

  applyWsOrderStatusChange: (payload) => {
    const tableStore = useTableStore.getState();
    const currentTableId =
      tableStore.selectedTable?.id || get().resolvedTableId;
    if (
      payload.table_id &&
      currentTableId &&
      String(payload.table_id) !== String(currentTableId)
    ) {
      return;
    }

    const orderId = payload.order_id;
    if (!orderId) return;

    const now = new Date().toISOString();

    if (payload.event === "order_cancelled") {
      set({ activeOrders: get().activeOrders.filter((o) => o.id !== orderId) });
      return;
    }

    const itemId = payload.item_id;
    const rawStatus = payload.item_status?.toUpperCase();
    if (!itemId || !rawStatus) return;

    const itemStatus = rawStatus as OrderItemStatus;

    set({
      activeOrders: get()
        .activeOrders.map((order) =>
          patchOrder(order, orderId, itemId, itemStatus, now),
        )
        .filter((o) => o.id !== orderId || !isTerminalOrderStatus(o.status)),
    });
  },
});
